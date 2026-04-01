import React, { useState, useRef } from "react";
import {
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  Modal,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import DateTimePicker from '@react-native-community/datetimepicker';
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { Ionicons } from "@expo/vector-icons";
import { formatDate, parseInvoiceItems, getAppConfig } from '../utils';
import { useTheme } from '../contexts/ThemeContext';
import { styles } from '../styles';
import ApiService from '../services/api';

// Helper to convert PaidTowards object to dropdown array
function paidTowardsOptions(appConfig) {
  const paid = appConfig?.AppDropDown?.[0]?.PaidTowards || {};
  return Object.keys(paid).map(key => ({ label: key, value: paid[key] }));
}

// Helper function to find matching rule based on Task_Status and Booking_Status
function findMatchingRule(appConfig, currentTaskStatus, currentBookingStatus) {
  if (!appConfig?.StatusTransitionRules) {
    return null;
  }

  return appConfig.StatusTransitionRules.find(rule => {
    // Check Task_Status match
    let taskMatches = false;
    if (rule.Task_Status === 'Any') {
      taskMatches = true;
    } else if (Array.isArray(rule.Task_Status)) {
      taskMatches = rule.Task_Status.includes(currentTaskStatus);
    } else {
      taskMatches = rule.Task_Status === currentTaskStatus;
    }

    if (!taskMatches) return false;

    // Check Booking_Status match (must use AND logic with Task_Status)
    let bookingMatches = false;
    if (rule.Booking_Status === 'Any') {
      // Check exceptions - if Booking_Status is in the exception list, it doesn't match
      if (rule.Booking_Status_Except && Array.isArray(rule.Booking_Status_Except)) {
        bookingMatches = !rule.Booking_Status_Except.includes(currentBookingStatus);
      } else {
        bookingMatches = true;
      }
    } else if (Array.isArray(rule.Booking_Status)) {
      bookingMatches = rule.Booking_Status.includes(currentBookingStatus);
    } else {
      bookingMatches = rule.Booking_Status === currentBookingStatus;
    }

    // Return true only if BOTH Task_Status AND Booking_Status match (AND logic)
    return taskMatches && bookingMatches;
  });
}

// Helper function to get allowed statuses based on current task status and booking status
function getAllowedStatuses(appConfig, currentTaskStatus, currentBookingStatus) {
  const matchingRule = findMatchingRule(appConfig, currentTaskStatus, currentBookingStatus);

  // Return allowed statuses from matching rule
  if (matchingRule?.Permissions?.ChangeStatus?.AllowedNextStatus) {
    return matchingRule.Permissions.ChangeStatus.AllowedNextStatus;
  }

  // If no matching rule found, return empty array (no status changes allowed)
  console.warn('⚠️ WARNING: No matching rule found for status change. Task_Status:', currentTaskStatus, 'Booking_Status:', currentBookingStatus);
  return [];
}

// Helper function to get permission for a specific section
function getPermission(appConfig, task, sectionName) {
  // Priority 1: Check UIComponents (user/role-based permissions)
  // This allows global overrides regardless of task state
  const uiSection = appConfig?.UIComponents?.MoveDetailsScreen?.Sections?.[sectionName];

  if (uiSection !== undefined) {
    // Convert UIComponents format to Access format
    if (uiSection.visible === false) {
      return { Access: "hidden" };
    }

    if (uiSection.visible === true) {
      // If canEdit is explicitly set, use it
      if (uiSection.canEdit === true) {
        return { Access: "edit" };
      } else if (uiSection.canEdit === false) {
        return { Access: "view" };
      }
      // If only visible:true without canEdit, continue to check StatusTransitionRules
    }
  }

  // Priority 2: Check StatusTransitionRules (task state-based permissions)
  const matchingRule = findMatchingRule(appConfig, task.Task_Status, task.Booking_Status);

  if (matchingRule?.Permissions?.[sectionName]) {
    return matchingRule.Permissions[sectionName];
  }

  // Priority 3: Default fallback - if no matching rule found, default to read-only
  // This ensures that when StatusTransitionRules exist but no rule matches,
  // the fields are read-only (preventing unauthorized changes)
  if (appConfig?.StatusTransitionRules && appConfig.StatusTransitionRules.length > 0) {
    return { Access: "view" };
  }

  // Priority 4: If no StatusTransitionRules defined at all, allow edit access
  return { Access: "edit" };
}

export default function MoveDetailsCard({ task, onTaskUpdate, readOnly }) {
  const { theme } = useTheme();
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);
  const [showEditInvoice, setShowEditInvoice] = useState(false);
  const [showChangeStatus, setShowChangeStatus] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [statusNotes, setStatusNotes] = useState('');
  const invoiceScrollRef = useRef(null);

  // App config and dropdown states
  const [appConfig, setAppConfig] = useState(null);
  const [selectedPaymentType, setSelectedPaymentType] = useState('');
  const [selectedPaidTowards, setSelectedPaidTowards] = useState('');
  const [showPaidTowardsPicker, setShowPaidTowardsPicker] = useState(false);

  // Invoice edit states
  const [isEditingInvoice, setIsEditingInvoice] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [currentEditingIndex, setCurrentEditingIndex] = useState(null);
  const [showTaxPicker, setShowTaxPicker] = useState(false);
  // Try to get tax ID from multiple sources: app-saved, backend TaxCodeRef, or will be derived from TaxPercentage
  const [selectedTaxId, setSelectedTaxId] = useState(task.Invoice_TaxId || task.Invoice_TaxCodeRef || null);
  const [showSendInvoiceConfirm, setShowSendInvoiceConfirm] = useState(false);
  const [invoiceSent, setInvoiceSent] = useState(false);

  // Loading states for buttons
  const [isSubmittingStatus, setIsSubmittingStatus] = useState(false);
  const [isAddingPayment, setIsAddingPayment] = useState(false);
  const [isSavingInvoice, setIsSavingInvoice] = useState(false);
  const [isSendingInvoice, setIsSendingInvoice] = useState(false);

  const parsedInvoiceItems = React.useMemo(() => {
    const parsed = parseInvoiceItems(task.Invoice_Items);
    return parsed;
  }, [task.Invoice_Items]);

  const [localInvoiceItems, setLocalInvoiceItems] = useState(parsedInvoiceItems);
  const [discount, setDiscount] = useState(task.Invoice_Discount || '0');
  const [discountType, setDiscountType] = useState(task.Invoice_DiscountType || 'percent');
  const [taxPercentage, setTaxPercentage] = useState(task.Invoice_TaxPercentage || 'GST/PST BC 12.00%');
  const [showDiscountTypeModal, setShowDiscountTypeModal] = useState(false);

  React.useEffect(() => {
    setLocalInvoiceItems(parsedInvoiceItems);
    setDiscount(task.Invoice_Discount || '0');
    setDiscountType(task.Invoice_DiscountType || 'percent');
    setTaxPercentage(task.Invoice_TaxPercentage || 'GST/PST BC 12.00%');
    // Prioritize: app-saved Invoice_TaxId > backend Invoice_TaxCodeRef > will derive from TaxPercentage
    setSelectedTaxId(task.Invoice_TaxId || task.Invoice_TaxCodeRef || null);
  }, [task, parsedInvoiceItems]);

  // Load app config when component mounts
  React.useEffect(() => {
    const loadAppConfig = async () => {
      const config = await getAppConfig();
      setAppConfig(config);

      // Set default values once config is loaded
      if (config?.InvoicePaymentvalue?.length > 0) {
        setSelectedPaymentType(config.InvoicePaymentvalue[0].PaymentType);
      }

      const paidOptions = paidTowardsOptions(config);
      if (paidOptions.length > 0) {
        setSelectedPaidTowards(paidOptions[0].label);
      }
    };

    loadAppConfig();
  }, []);

  // Initialize selectedTaxId when appConfig and taxPercentage are available
  React.useEffect(() => {
    if (appConfig?.InvoiceTaxPercentage && taxPercentage) {
      // Only auto-match if selectedTaxId is not already set
      if (!selectedTaxId) {
        // Find matching tax option by comparing multiple formats
        const matchingTax = appConfig.InvoiceTaxPercentage.find(tax => {
          const formattedWithDash = `${tax.Province} - ${(tax['Tax%'] * 100).toFixed(2)}%`;
          const formattedWithoutDash = `${tax.Province} ${(tax['Tax%'] * 100).toFixed(2)}%`;

          // Check multiple matching patterns
          const matches =
            formattedWithDash === taxPercentage ||
            formattedWithoutDash === taxPercentage ||
            tax.Province === taxPercentage ||
            // Also check if taxPercentage contains the province and percentage
            (taxPercentage.includes(tax.Province) && taxPercentage.includes((tax['Tax%'] * 100).toFixed(2)));

          return matches;
        });

        if (matchingTax && matchingTax.ID) {
          setSelectedTaxId(matchingTax.ID);
        }
      }
    }
  }, [appConfig, taxPercentage]);

  const calculateTotals = (items, discountVal, discType, taxPercent, taxOptions) => {
    const subtotal = items.reduce((sum, item) => sum + (item.amount || 0), 0);
    let discountAmount = 0;
    if (discType === 'percent') {
      discountAmount = subtotal * (parseFloat(discountVal) || 0) / 100;
    } else {
      discountAmount = parseFloat(discountVal) || 0;
    }
    const afterDiscount = subtotal - discountAmount;

    // Try to find the tax rate from the tax options first
    let taxRate = 0;
    if (taxOptions && taxOptions.length > 0) {
      // Check if taxPercent matches the formatted string pattern (e.g., "HST PE 2016 - 15.00%")
      const selectedTax = taxOptions.find(opt => {
        const formattedTax = `${opt.label} - ${(opt.taxPercent * 100).toFixed(2)}%`;
        return formattedTax === taxPercent || opt.label === taxPercent;
      });
      if (selectedTax) {
        taxRate = selectedTax.taxPercent * 100; // Convert to percentage
      }
    }

    // Fallback to parsing from string if not found in options
    if (taxRate === 0) {
      const taxMatch = taxPercent.match(/([\d.]+)%/);
      taxRate = taxMatch ? parseFloat(taxMatch[1]) : 0;
    }

    const taxAmount = afterDiscount * taxRate / 100;
    const total = afterDiscount + taxAmount;
    return {
      subtotal: subtotal.toFixed(2),
      discountAmount: discountAmount.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      total: total.toFixed(2),
    };
  };

  const totals = calculateTotals(localInvoiceItems, discount, discountType, taxPercentage, taxPercentageOptions);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newPayment, setNewPayment] = useState({
    amount: '',
    paidTowards: '',
    dateofpayment: '',
    collectedBy: '',
    transactionId: '',
    method: '',
  });

  // Always expanded - no collapse functionality

  const [paymentsExpanded, setPaymentsExpanded] = useState(null);
  const [localPayments, setLocalPayments] = useState(Array.isArray(task.payments) ? task.payments : []);

  // Derive options from app config
  const paymentMethodOptions = React.useMemo(() => {
    if (!appConfig?.InvoicePaymentvalue) return [];
    return appConfig.InvoicePaymentvalue.map(pm => ({
      label: pm.PaymentType,
      value: pm.PaymentMethodRefID,
      depositValue: pm.DepositToAccountRefID
    }));
  }, [appConfig]);

  const paidTowardsList = React.useMemo(() => {
    return paidTowardsOptions(appConfig);
  }, [appConfig]);

  const invoiceProductOptions = React.useMemo(() => {
    if (!appConfig?.InvoiceProdDesc) return [];
    return appConfig.InvoiceProdDesc.map(prod => ({
      label: prod.Name,
      description: prod.Description,
      idValue: prod.IdValue,
      unitPrice: prod.UnitPrice
    }));
  }, [appConfig]);

  const taxPercentageOptions = React.useMemo(() => {
    if (!appConfig?.InvoiceTaxPercentage) return [];
    return appConfig.InvoiceTaxPercentage.map(tax => ({
      label: tax.Province,
      id: tax.ID,
      taxPercent: tax['Tax%']
    }));
  }, [appConfig]);

  const moveDetailsFields = [
    { label: 'Move Date', key: 'Task_Date', always: true },
    { label: 'Origin', key: 'Move_From', always: true },
    { label: 'Destination', key: 'Move_To', always: true },
    { label: 'Move Size', key: 'Move_Size', always: true },
    { label: 'Assigned Date', key: 'Task_Assigned_Date', always: true },
    { label: 'Customer Name', key: 'Customer_Name' },
    { label: 'Phone', key: 'Phone_Number' },
    { label: 'Alt. Phone', key: 'Alt_Phone_Number' },
    { label: 'Origin Address', key: 'Task_From_Address' },
    { label: 'Destination Address', key: 'Task_To_Address' },
    { label: 'Pick up Date/Time', key: 'Pick_up_Time' },
    { label: 'Delivery Date', key: 'Task_Delivery_Date' },
    { label: 'Mover Revenue Split %', key: 'Task_Revenue_Split' },
    { label: 'Sales Agent', key: 'Sales_Agent' },
    { label: 'Notes', key: 'Special_Instruction' },
    { label: 'Pricing Agreement', key: 'Docu_Sign_Status' },
    { label: 'CC Form', key: 'Docu_Sign_Status' },
  ];

  const billEmail = task?.Email_Address || '';

  const handleStatusSubmit = async () => {
    try {
      // Validate that a new status was selected
      if (!newStatus) {
        Alert.alert("Validation Error", "Please select a new status before submitting.");
        return;
      }

      // Validate that the selected status is allowed
      const allowedStatuses = getAllowedStatuses(appConfig, task.Task_Status, task.Booking_Status);
      if (!allowedStatuses.includes(newStatus)) {
        Alert.alert("Invalid Status", `Cannot change to "${newStatus}". Allowed statuses: ${allowedStatuses.join(', ')}`);
        return;
      }

      setIsSubmittingStatus(true);

      // Use centralized API service
      await ApiService.updateTaskStatus(task.TaskRecord_ID, newStatus, statusNotes);

      Alert.alert("Success", 'Status updated successfully!');
      const updatedTask = {
        ...task,
        Task_Status: newStatus,
        Status_Notes: statusNotes,
      };
      if (onTaskUpdate) {
        await onTaskUpdate(updatedTask);
      }
      setIsSubmittingStatus(false);
      setShowChangeStatus(false);
      setNewStatus('');
      setStatusNotes('');
    } catch (err) {
      Alert.alert("Error", err.message || 'Failed to update status');
      setIsSubmittingStatus(false);
    }
  };

  const handleAddPayment = async () => {
    if (!newPayment.amount || !selectedPaidTowards || !newPayment.dateofpayment || !newPayment.collectedBy || !newPayment.transactionId || !selectedPaymentType) {
      Alert.alert("Validation Error", 'Please fill in all fields before saving.');
      return;
    }

    setIsAddingPayment(true);

    let txnDate = '';
    if (newPayment.dateofpayment) {
      const d = new Date(newPayment.dateofpayment);
      txnDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    const paidOption = paidTowardsList.find(opt => opt.label === selectedPaidTowards);
    const selectedPaymentMethod = paymentMethodOptions.find(opt => opt.label === selectedPaymentType);

    // Database record structure (for local state)
    const newPaymentRecord = {
      amount: newPayment.amount,
      paidTowards: paidOption && paidOption.label ? paidOption.label : '',
      dateofpayment: txnDate,
      collectedBy: newPayment.collectedBy,
      transactionId: newPayment.transactionId,
      method: selectedPaymentMethod?.label || selectedPaymentType,
      addedFromApp: true, // Flag to indicate this was added from the app
      synced: false, // Initially not synced
    };

    // Combined payload with dbData and qbData (matching backend format)
    const paymentPayload = {
      dbData: {
        amount: parseFloat(newPayment.amount),
        method: selectedPaymentMethod?.label || selectedPaymentType,
        transactionId: newPayment.transactionId,
        collectedBy: newPayment.collectedBy,
        paidTowards: paidOption && paidOption.label ? paidOption.label : '',
        dateofpayment: txnDate,
        invoiceId: task.Invoice_Number || task.TaskRecord_ID
      },
      qbData: {
        BillEmail: { Address: billEmail },
        PaymentMethodRef: { value: selectedPaymentMethod?.value || '' },
        DepositToAccountRef: { value: selectedPaymentMethod?.depositValue || '' },
        TotalAmt: parseFloat(newPayment.amount),
        PrivateNote: paidOption && paidOption.label ? paidOption.label : ''
      }
    };

    setLocalPayments([...localPayments, newPaymentRecord]);
    const updatedTask = {
      ...task,
      payments: [...(task.payments || []), newPaymentRecord]
    };
    if (onTaskUpdate) {
      await onTaskUpdate(updatedTask);
    }

    try {
      // Use centralized API service
      const result = await ApiService.submitPayment(paymentPayload);

      // Mark as synced if backend responds successfully
      if (result && result.status === 'success') {
        newPaymentRecord.synced = true;
        setLocalPayments([...localPayments, newPaymentRecord]);
        const syncedTask = {
          ...task,
          payments: [...(task.payments || []), newPaymentRecord]
        };
        if (onTaskUpdate) {
          await onTaskUpdate(syncedTask);
        }
      }
      setIsAddingPayment(false);
      setShowAddPayment(false);
      Alert.alert("Success", "Payment added successfully!");
    } catch (err) {
      console.error('❌ ERROR: Failed to add payment -', err.message);
      Alert.alert("Error", err.message || "Failed to add payment. Please try again.");
      setIsAddingPayment(false);
    }
  };

  const handleSaveInvoice = async () => {
    for (let i = 0; i < localInvoiceItems.length; i++) {
      const item = localInvoiceItems[i];
      const qty = parseFloat(item.quantity);
      const rate = parseFloat(item.rate);

      if (!item.product || !item.quantity || isNaN(qty) || !item.rate || isNaN(rate)) {
        Alert.alert("Validation Error", `Item ${i + 1} is incomplete. Please fill in product, quantity, and rate with valid numbers.`);
        return;
      }
    }
    if (!discount || isNaN(parseFloat(discount))) {
      Alert.alert("Validation Error", "Please enter a valid discount value.");
      return;
    }

    setIsSavingInvoice(true);

    // Build invoice items string, including TaxCodeRef if available per line item
    const invoiceItemsString = '[' + localInvoiceItems.map(item => {
      // Use line item's taxCodeRef if available, otherwise use summary selectedTaxId
      const itemTaxCodeRef = item.taxCodeRef || selectedTaxId || '';
      // Parse quantity and rate to ensure they're numbers when saving
      const qty = parseFloat(item.quantity) || 0;
      const rate = parseFloat(item.rate) || 0;
      return `{desc=${item.product}, prod=${item.description}, IdValue=${item.idValue || ''}, qty=${qty}, rate=${rate}, amount=${item.amount}, TaxCodeRef=${itemTaxCodeRef}}`;
    }).join(', ') + ']';
    const updatedTask = {
      ...task,
      Invoice_Items: invoiceItemsString,
      Invoice_Discount: discount,
      Invoice_DiscountType: discountType,
      Invoice_TaxPercentage: taxPercentage,
      Invoice_TaxId: selectedTaxId,
    };

    // Update task in background
    if (onTaskUpdate) {
      try {
        await onTaskUpdate(updatedTask);
        // Show success alert after update
        Alert.alert("Success", "Invoice updated successfully!");
        setIsSavingInvoice(false);
        // Close modal after successful save
        setShowEditInvoice(false);
      } catch (err) {
        console.error('❌ ERROR: Failed to save invoice -', err.message);
        Alert.alert("Error", "Failed to save invoice. Please try again.");
        setIsSavingInvoice(false);
      }
    } else {
      setIsSavingInvoice(false);
      setShowEditInvoice(false);
      Alert.alert("Success", "Invoice updated successfully!");
    }
  };

  const handleSendInvoice = async () => {
    try {
      // Get current date in EST timezone
      const currentDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD format in EST

      // Build Line items array
      const lineItems = localInvoiceItems.map((item, index) => {
        // Look up IdValue from appConfig if missing (with robust matching on Name and Description)
        let itemIdValue = item.idValue || '';

        if (!itemIdValue && (item.product || item.description)) {
          let matchingProduct = null;

          // Strategy 1: Exact match on Name (product)
          if (item.product) {
            matchingProduct = invoiceProductOptions.find(p => p.label === item.product);
          }

          // Strategy 2: Case-insensitive match on Name (product)
          if (!matchingProduct && item.product) {
            const normalizedProductName = item.product.trim().toLowerCase();
            matchingProduct = invoiceProductOptions.find(p =>
              p.label.trim().toLowerCase() === normalizedProductName
            );
          }

          // Strategy 3: Match on Description
          if (!matchingProduct && item.description) {
            const normalizedDesc = item.description.trim().toLowerCase();
            matchingProduct = invoiceProductOptions.find(p =>
              p.description && p.description.trim().toLowerCase().includes(normalizedDesc)
            );
          }

          // Strategy 4: Partial match on Name or Description
          if (!matchingProduct && (item.product || item.description)) {
            const searchTerm = (item.product || item.description).trim().toLowerCase();
            matchingProduct = invoiceProductOptions.find(p =>
              p.label.trim().toLowerCase().includes(searchTerm) ||
              (p.description && p.description.trim().toLowerCase().includes(searchTerm))
            );
          }

          if (matchingProduct) {
            itemIdValue = matchingProduct.idValue;
          } else {
            console.error(`❌ ERROR: Could not find IdValue for line item ${index + 1}: product="${item.product}", description="${item.description}"`);
          }
        }

        // TaxCodeRef: Apply proper fallback hierarchy
        // 1. Use line item's own taxCodeRef (highest priority)
        // 2. Use Invoice_TaxCodeRef from task (invoice-level tax code)
        // 3. Use Invoice_TaxPercentage to match against appConfig InvoiceTaxPercentage
        // 4. Use selectedTaxId as final fallback
        let itemTaxCodeRef = item.taxCodeRef;
        
        if (!itemTaxCodeRef) {
          // Try invoice-level tax code
          itemTaxCodeRef = task.Invoice_TaxCodeRef;
        }
        
        if (!itemTaxCodeRef && task.Invoice_TaxPercentage && appConfig?.InvoiceTaxPercentage) {
          // Extract percentage from Invoice_TaxPercentage (e.g., "GST/PST BC 12.00%" -> "12.00%")
          const taxPercentageStr = task.Invoice_TaxPercentage;
          const percentageMatch = taxPercentageStr.match(/(\d+\.?\d*)%/);
          
          if (percentageMatch) {
            const percentageValue = parseFloat(percentageMatch[1]);
            // Find matching tax in appConfig by percentage
            const matchingTax = appConfig.InvoiceTaxPercentage.find(tax => tax['Tax%'] === percentageValue / 100);
            if (matchingTax) {
              itemTaxCodeRef = matchingTax.ID;
            }
          }
        }
        
        if (!itemTaxCodeRef) {
          // Final fallback to selectedTaxId
          itemTaxCodeRef = selectedTaxId || '';
        }

        return {
          DetailType: "SalesItemLineDetail",
          Description: item.description || '',
          Amount: item.amount,
          SalesItemLineDetail: {
            ItemRef: {
              value: itemIdValue,
              name: item.product || ''
            },
            Qty: parseFloat(item.quantity) || 0,
            UnitPrice: parseFloat(item.rate) || 0,
            TaxCodeRef: {
              value: itemTaxCodeRef ? itemTaxCodeRef.toString() : ''
            }
          }
        };
      });

      // Add discount line if discount is present
      if (parseFloat(discount) > 0) {
        const isPercentBased = discountType === 'percent';
        lineItems.push({
          DetailType: "DiscountLineDetail",
          Amount: isPercentBased ? 0 : parseFloat(discount),
          DiscountLineDetail: {
            PercentBased: isPercentBased,
            DiscountPercent: isPercentBased ? parseFloat(discount) : 0,
            DiscountAccountRef: {
              value: "1",
              name: "Uncategorized Income"
            }
          }
        });
      }

      // Build invoice JSON
      const invoiceJson = {
        DocNumber: task.Invoice_Number || '',
        BillEmail: {
          Address: billEmail
        },
        TxnDate: currentDate,
        Line: lineItems
      };

      // Add CustomerRef if available
      if (task.Invoice_CustomerRef) {
        invoiceJson.CustomerRef = {
          value: task.Invoice_CustomerRef,
          name: task.Customer_Name || ''
        };
      }

      // Combined payload with qbData and dbData
      const invoicePayload = {
        qbData: invoiceJson,
        dbData: {
          tax: parseFloat(totals.taxAmount),
          items: localInvoiceItems.map(item => {
            const itemTaxCodeRef = item.taxCodeRef || selectedTaxId || '';
            return {
              desc: item.product || '',
              prod: item.description || '',
              quantity: parseFloat(item.quantity) || 0,
              rate: parseFloat(item.rate) || 0,
              amount: item.amount,
              idvalue: item.idValue || '',
              TaxCodeRef: itemTaxCodeRef ? itemTaxCodeRef.toString() : ''
            };
          }),
          subtotal: parseFloat(totals.subtotal),
          total: parseFloat(totals.total),
          discount: parseFloat(discount) || 0,
          discountType: discountType,
          taxPercentage: taxPercentage,
          invoiceId: task.Invoice_Number || task.TaskRecord_ID
        }
      };

      // ======== DETAILED INVOICE LOGGING START ========
      console.log('═══════════════════════════════════════════════════════');
      console.log('📤 SENDING INVOICE TO BACKEND');
      console.log('═══════════════════════════════════════════════════════');
      console.log('📋 Invoice Number:', task.Invoice_Number || task.TaskRecord_ID);
      console.log('📧 Bill Email:', billEmail);
      console.log('📅 Transaction Date:', currentDate);
      console.log('───────────────────────────────────────────────────────');
      console.log('📦 LINE ITEMS:');
      lineItems.forEach((line, i) => {
        if (line.DetailType === 'SalesItemLineDetail') {
          console.log(`  ${i + 1}. ${line.SalesItemLineDetail.ItemRef.name}`);
          console.log(`     - IdValue: "${line.SalesItemLineDetail.ItemRef.value}"`);
          console.log(`     - Qty: ${line.SalesItemLineDetail.Qty}`);
          console.log(`     - Rate: $${line.SalesItemLineDetail.UnitPrice}`);
          console.log(`     - Amount: $${line.Amount}`);
          console.log(`     - TaxCodeRef: "${line.SalesItemLineDetail.TaxCodeRef.value}"`);
        } else if (line.DetailType === 'DiscountLineDetail') {
          console.log(`  ${i + 1}. DISCOUNT`);
          console.log(`     - Type: ${line.DiscountLineDetail.PercentBased ? 'Percent' : 'Fixed'}`);
          console.log(`     - Value: ${line.DiscountLineDetail.PercentBased ? line.DiscountLineDetail.DiscountPercent + '%' : '$' + line.Amount}`);
        }
      });
      console.log('───────────────────────────────────────────────────────');
      console.log('💰 TOTALS:');
      console.log(`   Subtotal:  $${totals.subtotal}`);
      console.log(`   Discount:  -$${totals.discountAmount}`);
      console.log(`   Tax:       $${totals.taxAmount}`);
      console.log(`   TOTAL:     $${totals.total}`);
      console.log('───────────────────────────────────────────────────────');
      console.log('📄 FULL PAYLOAD (JSON):');
      console.log(JSON.stringify(invoicePayload, null, 2));
      console.log('═══════════════════════════════════════════════════════');

      setIsSendingInvoice(true);

      // Use centralized API service
      const result = await ApiService.sendInvoice(invoicePayload);

      // ======== DETAILED RESPONSE LOGGING ========
      console.log('═══════════════════════════════════════════════════════');
      console.log('📥 BACKEND RESPONSE');
      console.log('═══════════════════════════════════════════════════════');
      console.log('✅ Success:', result.success);
      console.log('💬 Message:', result.message || 'No message');
      console.log('📄 Full Response:');
      console.log(JSON.stringify(result, null, 2));
      console.log('═══════════════════════════════════════════════════════');
      // ======== DETAILED INVOICE LOGGING END ========

      if (result.success === true) {
        setInvoiceSent(true);
        Alert.alert("Success", result.message || "Invoice sent to customer successfully!");
      } else {
        Alert.alert("Error", result.message || "Failed to send invoice.");
      }
      setIsSendingInvoice(false);
    } catch (err) {
      console.error('═══════════════════════════════════════════════════════');
      console.error('❌ ERROR SENDING INVOICE');
      console.error('═══════════════════════════════════════════════════════');
      console.error('Error Message:', err.message);
      console.error('Error Stack:', err.stack);
      console.error('═══════════════════════════════════════════════════════');
      Alert.alert("Error", "Failed to send invoice: " + err.message);
      setIsSendingInvoice(false);
    }
    setShowSendInvoiceConfirm(false);
  };

  // Use SafeAreaView to avoid header being hidden behind status bar
  // Add extra top padding for Android if needed

  const renderHeader = () => (
    <View
      style={[
        styles.moveHeader,
        {
          zIndex: 1000,
          elevation: 5,
          shadowColor: theme.shadowColor,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: theme.shadowOpacity,
          shadowRadius: 3,
          paddingTop: 12,
          paddingBottom: 12,
        },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={styles.moveHeaderText}>{task.Invoice_Number || task.TaskRecord_ID || 'N/A'}</Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>{task.Task_Status || 'N/A'}</Text>
            </View>
          </View>
          <Text style={styles.moveHeaderSubtext}>
            {formatDate(task.Task_Date) || 'N/A'} • {task.Move_From || 'N/A'} → {task.Move_To || 'N/A'}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    // Main container for the detail card view (fills available space)
    <View style={{ flex: 1, backgroundColor: theme.mode === 'dark' ? '#0f0f0f' : '#f5f5f5' }}>
      {/* Scrollable content area for all card details */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 0 }}
        showsVerticalScrollIndicator={true}
        bounces={true}
      >
        {/* Header at the top (now scrolls with content) */}
        {renderHeader()}

        {/* Content padding starts here */}
        <View style={{ padding: 16 }}>
          {/* Move Details Card */}
          <View style={[styles.moveCard, { marginBottom: 16 }]}>
            <View style={styles.sectionHeader}><Text style={styles.sectionHeaderText}>Move Details</Text></View>
          {moveDetailsFields.map((f, idx) => {
            const show = f.always || Object.prototype.hasOwnProperty.call(task, f.key);
            const value = task[f.key];
            const isDateField = f.label.toLowerCase().includes('date') || f.label.toLowerCase().includes('time');
            const displayValue = value !== undefined && value !== null && value !== ''
              ? (isDateField ? formatDate(value) : value)
              : 'N/A';
            return show ? (
              <View key={f.label} style={styles.moveRow}>
                <Text style={styles.moveLabel}>{f.label}</Text>
                <Text style={styles.moveValue}>{displayValue}</Text>
              </View>
            ) : null;
          })}
        </View>

        {/* Status Card */}
        {getPermission(appConfig, task, "ChangeStatus")?.Access !== "hidden" && (
          <View style={[styles.moveCard, { marginBottom: 16 }]}>
            <View style={styles.sectionHeader}><Text style={styles.sectionHeaderText}>Status</Text></View>
            <View style={styles.paymentsCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 8 }}>
                <View>
                  <Text style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>Current Status</Text>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#22223b' }}>{task.Task_Status || 'N/A'}</Text>
                </View>
                {getPermission(appConfig, task, "ChangeStatus")?.Access === "edit" && !readOnly && (
                  <TouchableOpacity
                    style={[styles.addPaymentButton, { marginTop: 0, paddingVertical: 8, paddingHorizontal: 16 }]}
                    onPress={() => setShowChangeStatus(true)}
                  >
                    <Text style={[styles.addPaymentButtonText, { fontSize: 14 }]}>CHANGE STATUS</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

          <Modal
            visible={showChangeStatus}
            animationType="slide"
            transparent={true}
            onRequestClose={() => setShowChangeStatus(false)}
          >
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
              <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '90%' }}>
                <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 16 }}>Change Task Status</Text>
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontWeight: '600', marginBottom: 8, color: '#22223b' }}>New Status</Text>
                  <TouchableOpacity
                    style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 6, backgroundColor: '#fff', padding: 12, height: 48, justifyContent: 'center' }}
                    onPress={() => setShowStatusDropdown(true)}
                  >
                    <Text style={{ color: '#22223b', fontSize: 16 }}>
                      {newStatus || 'Select Status'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Modal
                  visible={showStatusDropdown}
                  animationType="fade"
                  transparent={true}
                  onRequestClose={() => setShowStatusDropdown(false)}
                >
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                    <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '80%' }}>
                      {(() => {
                        const allowedStatuses = getAllowedStatuses(appConfig, task.Task_Status, task.Booking_Status);

                        if (allowedStatuses.length === 0) {
                          return (
                            <View style={{ paddingVertical: 20 }}>
                              <Text style={{ fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 8 }}>
                                No status changes available
                              </Text>
                              <Text style={{ fontSize: 12, color: '#999', textAlign: 'center' }}>
                                Current: {task.Task_Status} ({task.Booking_Status})
                              </Text>
                            </View>
                          );
                        }

                        return allowedStatuses.map((status) => (
                          <TouchableOpacity
                            key={status}
                            style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f1f1' }}
                            onPress={() => {
                              setNewStatus(status);
                              setShowStatusDropdown(false);
                            }}
                          >
                            <Text style={{ fontSize: 16, color: '#22223b', textAlign: 'center' }}>{status}</Text>
                          </TouchableOpacity>
                        ));
                      })()}
                      <TouchableOpacity
                        style={[styles.button, { marginTop: 10 }]}
                        onPress={() => setShowStatusDropdown(false)}
                      >
                        <Text style={styles.buttonText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Modal>
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontWeight: '600', marginBottom: 8 }}>Notes</Text>
                  <TextInput
                    style={{ borderWidth: 1, borderColor: '#eee', borderRadius: 6, padding: 10, height: 100, textAlignVertical: 'top' }}
                    value={statusNotes}
                    onChangeText={setStatusNotes}
                    placeholder="Add notes about this status change..."
                    multiline
                    numberOfLines={4}
                  />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <TouchableOpacity
                    style={[styles.button, { flex: 1, marginRight: 8, backgroundColor: '#888' }]}
                    onPress={() => {
                      setShowChangeStatus(false);
                      setNewStatus('');
                      setStatusNotes('');
                    }}
                  >
                    <Text style={styles.buttonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, { flex: 1, marginLeft: 8 }, (isSubmittingStatus || !newStatus) && { opacity: 0.6 }]}
                    onPress={handleStatusSubmit}
                    disabled={isSubmittingStatus || !newStatus}
                  >
                    {isSubmittingStatus ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.buttonText}>Submit</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
          </View>
        )}

        {/* Payments Card */}
        {getPermission(appConfig, task, "Payments")?.Access !== "hidden" && (
          <View style={[styles.moveCard, { marginBottom: 16 }]}>
            <View style={styles.sectionHeader}><Text style={styles.sectionHeaderText}>Payments</Text></View>
            <View style={styles.paymentsCard}>
              <View style={styles.paymentTableHeader}>
                <Text style={[styles.paymentTableCellHeader, { flex: 1.5, textAlign: 'left' }]}>Date</Text>
                <Text style={[styles.paymentTableCellHeader, { flex: 2, textAlign: 'left' }]}>Paid Towards</Text>
                <Text style={[styles.paymentTableCellHeader, { flex: 1, textAlign: 'right' }]}>Amount</Text>
              </View>
              {localPayments.length > 0 ? (
                localPayments.map((p, idx) => (
                  <TouchableOpacity key={idx} onPress={() => setPaymentsExpanded(paymentsExpanded === idx ? null : idx)}>
                    <View style={styles.paymentTableRow}>
                      <Text style={[styles.paymentTableCell, { flex: 1.5, textAlign: 'left' }]}>
                        {p.dateofpayment !== undefined && p.dateofpayment !== null && p.dateofpayment !== '' ? formatDate(p.dateofpayment) : 'N/A'}
                      </Text>
                      <Text style={[styles.paymentTableCell, { flex: 2, textAlign: 'left' }]}>
                        {p.paidTowards !== undefined && p.paidTowards !== null && p.paidTowards !== '' ? p.paidTowards : 'N/A'}
                      </Text>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
                        <Text style={[styles.paymentTableCell, { textAlign: 'right', fontWeight: '600' }]}>
                          ${p.amount !== undefined && p.amount !== null && p.amount !== '' ? p.amount : 'N/A'}
                        </Text>
                        {p.addedFromApp && p.synced && (
                          <Ionicons name="checkmark-circle" size={16} color="#22c55e" style={{ marginLeft: 6 }} />
                        )}
                      </View>
                    </View>
                    {paymentsExpanded === idx && (
                      <View style={styles.paymentDetailsRow}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={styles.paymentDetailsLabel}>Collected By</Text>
                          <Text style={styles.paymentDetailsValue}>{p.collectedBy !== undefined && p.collectedBy !== null && p.collectedBy !== '' ? p.collectedBy : 'N/A'}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={styles.paymentDetailsLabel}>Transaction Ref</Text>
                          <Text style={styles.paymentDetailsValue}>{p.transactionId !== undefined && p.transactionId !== null && p.transactionId !== '' ? p.transactionId : 'N/A'}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={styles.paymentDetailsLabel}>Payment Method</Text>
                          <Text style={styles.paymentDetailsValue}>{p.method !== undefined && p.method !== null && p.method !== '' ? p.method : 'N/A'}</Text>
                        </View>
                        {p.addedFromApp && (
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={styles.paymentDetailsLabel}>Backend Status</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              {p.synced ? (
                                <>
                                  <Ionicons name="checkmark-circle" size={14} color="#22c55e" style={{ marginRight: 4 }} />
                                  <Text style={[styles.paymentDetailsValue, { color: '#22c55e' }]}>Synced</Text>
                                </>
                              ) : (
                                <>
                                  <Ionicons name="time-outline" size={14} color="#f59e0b" style={{ marginRight: 4 }} />
                                  <Text style={[styles.paymentDetailsValue, { color: '#f59e0b' }]}>Pending</Text>
                                </>
                              )}
                            </View>
                          </View>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={{ padding: 10, color: '#888' }}>No payments found.</Text>
              )}
              {getPermission(appConfig, task, "Payments")?.Access === "edit" && !readOnly && (
                <TouchableOpacity style={styles.addPaymentButton} onPress={() => {
                  setNewPayment({
                    amount: '',
                    paidTowards: '',
                    dateofpayment: '',
                    collectedBy: '',
                    transactionId: '',
                    method: '',
                  });
                  setSelectedPaymentType('');
                  setSelectedPaidTowards('');
                  setShowAddPayment(true);
                }}>
                  <Text style={styles.addPaymentButtonText}>ADD PAYMENT</Text>
                </TouchableOpacity>
              )}

              <Modal
                visible={showAddPayment}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowAddPayment(false)}
              >
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
                  <KeyboardAwareScrollView
                    style={{ width: '100%' }}
                    contentContainerStyle={{ justifyContent: 'center', alignItems: 'center', flexGrow: 1 }}
                    enableOnAndroid={true}
                    keyboardShouldPersistTaps="handled"
                  >
                    <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '90%' }}>
                      <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 12 }}>Add Payment</Text>
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontWeight: '600', marginBottom: 4 }}>Payment Method</Text>
                        <TouchableOpacity
                          style={{ borderWidth: 1, borderColor: '#eee', borderRadius: 6, padding: 10, backgroundColor: '#fff' }}
                          onPress={() => setShowPaymentPicker(true)}
                        >
                          <Text style={{ color: selectedPaymentType ? '#22223b' : '#999' }}>
                            {selectedPaymentType || 'Select Payment Method'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <Modal
                        visible={showPaymentPicker}
                        animationType="fade"
                        transparent={true}
                        onRequestClose={() => setShowPaymentPicker(false)}
                      >
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                          <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '80%' }}>
                            {paymentMethodOptions.map((opt) => (
                              <TouchableOpacity
                                key={opt.label}
                                style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f1f1' }}
                                onPress={() => {
                                  setSelectedPaymentType(opt.label);
                                  setNewPayment({ ...newPayment, method: opt.label });
                                  setShowPaymentPicker(false);
                                }}
                              >
                                <Text style={{ fontSize: 16, color: '#22223b' }}>{opt.label}</Text>
                              </TouchableOpacity>
                            ))}
                            <TouchableOpacity style={[styles.button, { marginTop: 10 }]} onPress={() => setShowPaymentPicker(false)}>
                              <Text style={styles.buttonText}>Cancel</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </Modal>
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontWeight: '600', marginBottom: 4 }}>Amount</Text>
                        <TextInput
                          style={{ borderWidth: 1, borderColor: '#eee', borderRadius: 6, padding: 8 }}
                          value={newPayment.amount}
                          onChangeText={val => setNewPayment({ ...newPayment, amount: val })}
                          placeholder="Amount"
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontWeight: '600', marginBottom: 4 }}>Paid Towards</Text>
                        <TouchableOpacity
                          style={{ borderWidth: 1, borderColor: '#eee', borderRadius: 6, padding: 10, backgroundColor: '#fff' }}
                          onPress={() => setShowPaidTowardsPicker(true)}
                        >
                          <Text style={{ color: selectedPaidTowards ? '#22223b' : '#999' }}>
                            {selectedPaidTowards || 'Select Paid Towards'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Paid Towards Picker Modal */}
                      <Modal
                        visible={showPaidTowardsPicker}
                        animationType="fade"
                        transparent={true}
                        onRequestClose={() => setShowPaidTowardsPicker(false)}
                      >
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                          <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '80%' }}>
                            {paidTowardsList.map((opt) => (
                              <TouchableOpacity
                                key={opt.value}
                                style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f1f1' }}
                                onPress={() => {
                                  setSelectedPaidTowards(opt.label);
                                  setNewPayment({ ...newPayment, paidTowards: opt.label });
                                  setShowPaidTowardsPicker(false);
                                }}
                              >
                                <Text style={{ fontSize: 16, color: '#22223b' }}>{opt.label}</Text>
                              </TouchableOpacity>
                            ))}
                            <TouchableOpacity style={[styles.button, { marginTop: 10 }]} onPress={() => setShowPaidTowardsPicker(false)}>
                              <Text style={styles.buttonText}>Cancel</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </Modal>
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontWeight: '600', marginBottom: 4, color: '#22223b' }}>Date</Text>
                        <TouchableOpacity
                          style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 10, backgroundColor: '#fff' }}
                          onPress={() => setShowDatePicker(true)}
                        >
                          <Text style={{ color: '#22223b', fontSize: 14 }}>
                            {newPayment.dateofpayment ? formatDate(newPayment.dateofpayment) : 'Select Date'}
                          </Text>
                        </TouchableOpacity>
                        {showDatePicker && (
                          <DateTimePicker
                            value={newPayment.dateofpayment ? new Date(newPayment.dateofpayment) : new Date()}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            textColor="#22223b"
                            maximumDate={new Date()}
                            onChange={(event, selectedDate) => {
                              if (Platform.OS === 'android') {
                                setShowDatePicker(false);
                              }
                              if (selectedDate) {
                                setNewPayment({ ...newPayment, dateofpayment: selectedDate.toISOString() });
                              }
                            }}
                          />
                        )}
                        {showDatePicker && Platform.OS === 'ios' && (
                          <TouchableOpacity style={[styles.button, { marginTop: 10 }]} onPress={() => setShowDatePicker(false)}>
                            <Text style={styles.buttonText}>Done</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontWeight: '600', marginBottom: 4 }}>Collected By</Text>
                        <TextInput
                          style={{ borderWidth: 1, borderColor: '#eee', borderRadius: 6, padding: 8 }}
                          value={newPayment.collectedBy}
                          onChangeText={val => setNewPayment({ ...newPayment, collectedBy: val })}
                          placeholder="Collected By"
                        />
                      </View>
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontWeight: '600', marginBottom: 4 }}>Transaction Ref</Text>
                        <TextInput
                          style={{ borderWidth: 1, borderColor: '#eee', borderRadius: 6, padding: 8 }}
                          value={newPayment.transactionId}
                          onChangeText={val => setNewPayment({ ...newPayment, transactionId: val })}
                          placeholder="Transaction Ref"
                        />
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
                        <TouchableOpacity 
                          style={[styles.button, { flex: 1, marginRight: 8, backgroundColor: '#888' }]} 
                          onPress={() => setShowAddPayment(false)}
                        >
                          <Text style={styles.buttonText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.button, { flex: 1, marginLeft: 8 }, isAddingPayment && { opacity: 0.6 }]}
                          onPress={handleAddPayment}
                          disabled={isAddingPayment}
                        >
                          {isAddingPayment ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={styles.buttonText}>Save</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  </KeyboardAwareScrollView>
                </View>
              </Modal>
            </View>
          </View>
        )}

        {/* Invoice Card */}
        {(getPermission(appConfig, task, "InvoiceItems")?.Access !== "hidden" ||
          getPermission(appConfig, task, "InvoiceSummary")?.Access !== "hidden") && (
          <View style={[styles.moveCard, { marginBottom: 16 }]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>Invoice</Text>
              {invoiceSent && (
                <Ionicons name="checkmark-circle" size={20} color="#22c55e" style={{ marginLeft: 8 }} />
              )}
            </View>
            <View style={styles.invoiceCard}>
              <View style={styles.invoiceTableHeader}>
                <Text style={[styles.invoiceTableCellHeader, { flex: 2, textAlign: 'left' }]}>Product</Text>
                <Text style={[styles.invoiceTableCellHeader, { flex: 1 }]}>Qty</Text>
                <Text style={[styles.invoiceTableCellHeader, { flex: 1 }]}>Rate</Text>
                <Text style={[styles.invoiceTableCellHeader, { flex: 1, textAlign: 'right' }]}>Amount</Text>
              </View>
              {localInvoiceItems.map((item, idx) => (
                <View key={idx} style={styles.invoiceTableRow}>
                  <View style={{ flex: 2 }}>
                    <Text style={[styles.invoiceTableCell, { textAlign: 'left' }]}>{item.product}</Text>
                    {item.description && (
                      <Text style={[styles.invoiceTableCell, { textAlign: 'left', fontSize: 11, color: '#666', fontWeight: '400', marginTop: 2 }]}>
                        {item.description}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.invoiceTableCell, { flex: 1 }]}>{item.quantity}</Text>
                  <Text style={[styles.invoiceTableCell, { flex: 1 }]}>${item.rate}</Text>
                  <Text style={[styles.invoiceTableCell, { flex: 1, textAlign: 'right', fontWeight: '600' }]}>${item.amount.toFixed(2)}</Text>
                </View>
              ))}

              {/* Edit Line Items Bar */}
              {getPermission(appConfig, task, "InvoiceItems")?.Access === "edit" && !readOnly && (
                <TouchableOpacity
                  onPress={() => setShowEditInvoice(true)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 10,
                    borderTopWidth: 1,
                    borderBottomWidth: 1,
                    borderColor: '#ddd',
                    backgroundColor: '#f8f9fa',
                    marginVertical: 8
                  }}
                >
                  <Ionicons name="create-outline" size={18} color="#e63946" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 14, color: '#e63946', fontWeight: '600' }}>Edit Line Items</Text>
                </TouchableOpacity>
              )}

              <View style={styles.invoiceSummaryContainer}>
                {/* Edit/Done Icon */}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 }}>
                  {getPermission(appConfig, task, "InvoiceSummary")?.Access === "edit" && !readOnly && (
                    <TouchableOpacity onPress={() => {
                      if (isEditingInvoice) {
                        handleSaveInvoice();
                        setIsEditingInvoice(false);
                      } else {
                        setIsEditingInvoice(true);
                      }
                    }}>
                      <Ionicons
                        name={isEditingInvoice ? "checkmark-circle" : "create-outline"}
                        size={24}
                        color={isEditingInvoice ? "#22c55e" : "#e63946"}
                      />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.invoiceSummaryRow}>
                  <Text style={styles.invoiceSummaryLabel}>Subtotal</Text>
                  <Text style={styles.invoiceSummaryValue}>${totals.subtotal}</Text>
                </View>

                {/* Discount Row - Editable */}
                <View style={styles.invoiceSummaryRow}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.invoiceSummaryLabel}>Discount</Text>
                    {isEditingInvoice && (
                      <View style={{ flexDirection: 'row', marginLeft: 8, alignItems: 'center', flex: 1 }}>
                        <TextInput
                          style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 4, padding: 6, backgroundColor: '#fff', fontSize: 12, width: 60, marginRight: 6 }}
                          value={discount}
                          onChangeText={setDiscount}
                          placeholder="Value"
                          keyboardType="numeric"
                        />
                        <TouchableOpacity
                          style={{
                            borderWidth: 1,
                            borderColor: discountType === 'fixed' ? '#e63946' : '#ddd',
                            borderRadius: 4,
                            padding: 8,
                            backgroundColor: discountType === 'fixed' ? '#e63946' : '#fff',
                            marginRight: 4,
                            minWidth: 40
                          }}
                          onPress={() => setDiscountType('fixed')}
                        >
                          <Text style={{ fontSize: 14, textAlign: 'center', fontWeight: '600', color: discountType === 'fixed' ? '#fff' : '#000' }}>$</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{
                            borderWidth: 1,
                            borderColor: discountType === 'percent' ? '#e63946' : '#ddd',
                            borderRadius: 4,
                            padding: 8,
                            backgroundColor: discountType === 'percent' ? '#e63946' : '#fff',
                            minWidth: 40
                          }}
                          onPress={() => setDiscountType('percent')}
                        >
                          <Text style={{ fontSize: 14, textAlign: 'center', fontWeight: '600', color: discountType === 'percent' ? '#fff' : '#000' }}>%</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                  <Text style={styles.invoiceSummaryValue}>
                    {!isEditingInvoice && `(${discountType === 'percent' ? `${discount}%` : `$${discount}`}) `}
                    -${totals.discountAmount}
                  </Text>
                </View>

                {/* Discount Type Picker Modal */}
                <Modal
                  visible={showDiscountTypeModal}
                  animationType="fade"
                  transparent={true}
                  onRequestClose={() => setShowDiscountTypeModal(false)}
                >
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                    <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '80%' }}>
                      <TouchableOpacity
                        style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f1f1' }}
                        onPress={() => {
                          setDiscountType('percent');
                          setShowDiscountTypeModal(false);
                        }}
                      >
                        <Text style={{ fontSize: 16, color: '#22223b', textAlign: 'center' }}>Percentage (%)</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f1f1' }}
                        onPress={() => {
                          setDiscountType('fixed');
                          setShowDiscountTypeModal(false);
                        }}
                      >
                        <Text style={{ fontSize: 16, color: '#22223b', textAlign: 'center' }}>Fixed Amount ($)</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.button, { marginTop: 10 }]}
                        onPress={() => setShowDiscountTypeModal(false)}
                      >
                        <Text style={styles.buttonText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Modal>

                {/* Tax Row - Editable */}
                <View style={styles.invoiceSummaryRow}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.invoiceSummaryLabel}>Tax</Text>
                    {isEditingInvoice && (
                      <TouchableOpacity
                        style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 4, padding: 6, backgroundColor: '#fff', marginLeft: 8, flex: 1 }}
                        onPress={() => setShowTaxPicker(true)}
                      >
                        <Text style={{ fontSize: 12 }} numberOfLines={1}>{taxPercentage || 'Select Tax'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.invoiceSummaryValue}>
                    {!isEditingInvoice && `(${taxPercentage}) `}
                    ${totals.taxAmount}
                  </Text>
                </View>

                {/* Tax Picker Modal */}
                <Modal
                  visible={showTaxPicker}
                  animationType="fade"
                  transparent={true}
                  onRequestClose={() => setShowTaxPicker(false)}
                >
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                    <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '80%', maxHeight: '70%' }}>
                      <ScrollView>
                        {taxPercentageOptions.map((opt) => (
                          <TouchableOpacity
                            key={opt.id}
                            style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f1f1' }}
                            onPress={() => {
                              const formattedTax = `${opt.label} - ${(opt.taxPercent * 100).toFixed(2)}%`;
                              setTaxPercentage(formattedTax);
                              setSelectedTaxId(opt.id);
                              setShowTaxPicker(false);
                            }}
                          >
                            <Text style={{ fontSize: 16, color: '#22223b' }}>{opt.label}</Text>
                            <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{(opt.taxPercent * 100).toFixed(2)}%</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                      <TouchableOpacity
                        style={[styles.button, { marginTop: 10 }]}
                        onPress={() => setShowTaxPicker(false)}
                      >
                        <Text style={styles.buttonText}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Modal>
                <View style={[styles.invoiceSummaryRow, { borderTopWidth: 2, borderTopColor: '#e63946', marginTop: 8, paddingTop: 8 }]}>
                  <Text style={[styles.invoiceSummaryLabel, { fontWeight: 'bold', fontSize: 16 }]}>Total</Text>
                  <Text style={[styles.invoiceSummaryValue, { fontWeight: 'bold', fontSize: 16, color: '#e63946' }]}>${totals.total}</Text>
                </View>
                <View style={styles.invoiceSummaryRow}>
                  <Text style={styles.invoiceSummaryLabel}>Total Payments Made</Text>
                  <Text style={styles.invoiceSummaryValue}>
                    ${localPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0).toFixed(2)}
                  </Text>
                </View>
                <View style={[styles.invoiceSummaryRow, { marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#ccc' }]}>
                  <Text style={[styles.invoiceSummaryLabel, { fontWeight: 'bold', fontSize: 15 }]}>Balance Amount to Pay</Text>
                  <Text style={[styles.invoiceSummaryValue, { fontWeight: 'bold', fontSize: 15, color: '#e63946' }]}>
                    ${(parseFloat(totals.total) - localPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)).toFixed(2)}
                  </Text>
                </View>
              </View>

              {getPermission(appConfig, task, "SendInvoice")?.Access === "edit" && !readOnly && (
                <TouchableOpacity style={styles.editInvoiceButton} onPress={() => setShowSendInvoiceConfirm(true)}>
                  <Text style={styles.editInvoiceButtonText}>SEND INVOICE</Text>
                </TouchableOpacity>
              )}

              {/* Send Invoice Confirmation Modal */}
              <Modal
                visible={showSendInvoiceConfirm}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setShowSendInvoiceConfirm(false)}
              >
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
                  <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '85%' }}>
                    <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 12, color: '#22223b' }}>Send Invoice</Text>
                    <Text style={{ fontSize: 16, marginBottom: 20, color: '#666' }}>
                      Are you sure you want to send this invoice to the customer at {billEmail}?
                    </Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <TouchableOpacity
                        style={[styles.button, { flex: 1, marginRight: 8, backgroundColor: '#888' }]}
                        onPress={() => setShowSendInvoiceConfirm(false)}
                      >
                        <Text style={styles.buttonText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.button, { flex: 1, marginLeft: 8, backgroundColor: '#e63946' }, isSendingInvoice && { opacity: 0.6 }]}
                        onPress={handleSendInvoice}
                        disabled={isSendingInvoice}
                      >
                        {isSendingInvoice ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.buttonText}>Send</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Modal>

              <Modal
                visible={showEditInvoice}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowEditInvoice(false)}
              >
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
                  <KeyboardAwareScrollView
                    style={{ width: '100%' }}
                    contentContainerStyle={{ justifyContent: 'center', alignItems: 'center', flexGrow: 1 }}
                    enableOnAndroid={true}
                    keyboardShouldPersistTaps="handled"
                  >
                    <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '95%', maxHeight: '90%' }}>
                      <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 12 }}>Edit Invoice</Text>
                      <ScrollView ref={invoiceScrollRef} style={{ maxHeight: 300, marginBottom: 8 }}>
                        {localInvoiceItems.map((item, idx) => (
                          <View key={idx} style={{ marginBottom: 16, padding: 12, backgroundColor: '#f8f9fa', borderRadius: 8 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                              <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#22223b' }}>Item {idx + 1}</Text>
                              <TouchableOpacity
                                onPress={() => {
                                  const newItems = localInvoiceItems.filter((_, i) => i !== idx);
                                  setLocalInvoiceItems(newItems);
                                }}
                              >
                                <Ionicons name="trash-outline" size={20} color="#e63946" />
                              </TouchableOpacity>
                            </View>
                            <Text style={{ fontSize: 12, color: '#666', marginBottom: 3 }}>Product *</Text>
                            <TouchableOpacity
                              style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 10, marginBottom: 8, backgroundColor: '#fff' }}
                              onPress={() => {
                                setCurrentEditingIndex(idx);
                                setShowProductPicker(true);
                              }}
                            >
                              <Text style={{ color: item.product ? '#000' : '#999' }}>
                                {item.product || 'Select Product'}
                              </Text>
                            </TouchableOpacity>
                            <Text style={{ fontSize: 12, color: '#666', marginBottom: 3 }}>Description</Text>
                            <TextInput
                              style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 8, marginBottom: 8, backgroundColor: '#fff' }}
                              value={item.description}
                              onChangeText={(text) => {
                                const newItems = [...localInvoiceItems];
                                newItems[idx].description = text;
                                setLocalInvoiceItems(newItems);
                              }}
                              placeholder="Enter description"
                              multiline={true}
                              numberOfLines={2}
                            />
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                              <View style={{ flex: 1, marginRight: 4 }}>
                                <Text style={{ fontSize: 12, color: '#666', marginBottom: 3 }}>Quantity *</Text>
                                <TextInput
                                  style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 8, backgroundColor: '#fff' }}
                                  value={typeof item.quantity === 'string' ? item.quantity : item.quantity.toString()}
                                  onChangeText={(text) => {
                                    const newItems = [...localInvoiceItems];
                                    // Store as string to preserve decimal input (e.g., "1." or "1.5")
                                    newItems[idx].quantity = text;
                                    // Calculate amount using parsed values
                                    const qtyNum = parseFloat(text) || 0;
                                    const rateNum = parseFloat(newItems[idx].rate) || 0;
                                    newItems[idx].amount = qtyNum * rateNum;
                                    setLocalInvoiceItems(newItems);
                                  }}
                                  placeholder="0"
                                  keyboardType="decimal-pad"
                                />
                              </View>
                              <View style={{ flex: 1, marginLeft: 4 }}>
                                <Text style={{ fontSize: 12, color: '#666', marginBottom: 3 }}>Rate *</Text>
                                <TextInput
                                  style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 8, backgroundColor: '#fff' }}
                                  value={typeof item.rate === 'string' ? item.rate : item.rate.toString()}
                                  onChangeText={(text) => {
                                    const newItems = [...localInvoiceItems];
                                    // Store as string to preserve decimal input (e.g., "10." or "10.5")
                                    newItems[idx].rate = text;
                                    // Calculate amount using parsed values
                                    const qtyNum = parseFloat(newItems[idx].quantity) || 0;
                                    const rateNum = parseFloat(text) || 0;
                                    newItems[idx].amount = qtyNum * rateNum;
                                    setLocalInvoiceItems(newItems);
                                  }}
                                  placeholder="0"
                                  keyboardType="decimal-pad"
                                />
                              </View>
                            </View>
                            <Text style={{ marginTop: 8, fontSize: 14, color: '#666' }}>Amount: ${item.amount.toFixed(2)}</Text>
                          </View>
                        ))}
                      </ScrollView>
                      <TouchableOpacity
                        style={[styles.button, { marginBottom: 16 }]}
                        onPress={() => {
                          // New line items inherit the summary tax ID
                          setLocalInvoiceItems([...localInvoiceItems, {
                            product: '',
                            description: '',
                            idValue: '',
                            quantity: '0',
                            rate: '0',
                            amount: 0,
                            taxCodeRef: selectedTaxId || null  // Inherit summary tax
                          }]);
                          setTimeout(() => {
                            invoiceScrollRef.current?.scrollToEnd({ animated: true });
                          }, 100);
                        }}
                      >
                        <Text style={styles.buttonText}>+ Add Item</Text>
                      </TouchableOpacity>

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
                        <TouchableOpacity
                          style={[styles.button, { flex: 1, marginRight: 8, backgroundColor: '#888' }]}
                          onPress={() => {
                            setLocalInvoiceItems(parsedInvoiceItems);
                            setShowEditInvoice(false);
                          }}
                        >
                          <Text style={styles.buttonText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.button, { flex: 1, marginLeft: 8 }, isSavingInvoice && { opacity: 0.6 }]}
                          onPress={handleSaveInvoice}
                          disabled={isSavingInvoice}
                        >
                          {isSavingInvoice ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={styles.buttonText}>Save</Text>
                          )}
                        </TouchableOpacity>
                      </View>

                      {/* Product Picker Modal - Nested inside Edit Invoice Modal */}
                      <Modal
                        visible={showProductPicker}
                        animationType="slide"
                        transparent={true}
                        onRequestClose={() => setShowProductPicker(false)}
                      >
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
                          <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '90%', maxHeight: '80%' }}>
                            <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 12 }}>Select Product</Text>
                            <ScrollView style={{ maxHeight: '70%' }}>
                              {invoiceProductOptions.map((prod) => (
                                <TouchableOpacity
                                  key={prod.idValue}
                                  style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f1f1' }}
                                  onPress={() => {
                                    if (currentEditingIndex !== null) {
                                      const newItems = [...localInvoiceItems];
                                      const existingItem = newItems[currentEditingIndex];
                                      const qtyNum = parseFloat(existingItem.quantity) || 0;
                                      newItems[currentEditingIndex] = {
                                        ...existingItem,
                                        product: prod.label,
                                        description: prod.description,
                                        idValue: prod.idValue,
                                        rate: prod.unitPrice.toString(),
                                        amount: qtyNum * prod.unitPrice,
                                        // Preserve existing taxCodeRef or use summary tax
                                        taxCodeRef: existingItem.taxCodeRef || selectedTaxId || null
                                      };
                                      setLocalInvoiceItems(newItems);
                                    }
                                    setShowProductPicker(false);
                                    setCurrentEditingIndex(null);
                                  }}
                                >
                                  <Text style={{ fontSize: 16, color: '#22223b', fontWeight: '600' }}>{prod.label}</Text>
                                  <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{prod.description}</Text>
                                  <Text style={{ fontSize: 14, color: '#e63946', marginTop: 4 }}>${prod.unitPrice.toFixed(2)}</Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                            <TouchableOpacity
                              style={[styles.button, { marginTop: 16, backgroundColor: '#888' }]}
                              onPress={() => {
                                setShowProductPicker(false);
                                setCurrentEditingIndex(null);
                              }}
                            >
                              <Text style={styles.buttonText}>Cancel</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </Modal>
                    </View>
                  </KeyboardAwareScrollView>
                </View>
              </Modal>
            </View>
          </View>
        )}
        </View>
      </ScrollView>
    </View>
  );
}
