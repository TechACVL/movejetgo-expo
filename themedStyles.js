import { StyleSheet } from 'react-native';

// Create styles that adapt to the current theme
export const createThemedStyles = (theme) => StyleSheet.create({
  // Move/Task Card Styles
  moveCard: {
    backgroundColor: theme.cardBackground,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.borderLight,
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: theme.shadowColor,
    shadowOpacity: theme.shadowOpacity,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  moveHeader: {
    borderBottomWidth: 2,
    borderBottomColor: theme.primary,
    padding: 12,
    backgroundColor: theme.primary,
  },
  moveHeaderText: {
    fontWeight: 'bold',
    fontSize: 16,
    color: theme.textInverse,
    letterSpacing: 0.5,
  },
  moveHeaderSubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  moveRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.divider,
  },
  moveLabel: {
    color: theme.text,
    fontWeight: '600',
    fontSize: 13,
    flex: 1.2,
  },
  moveValue: {
    color: theme.text,
    fontSize: 13,
    flex: 1.5,
    textAlign: 'right',
  },

  // Container Styles
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
  },

  // Card Styles
  card: {
    backgroundColor: theme.cardBackground,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: theme.shadowColor,
    shadowOpacity: theme.shadowOpacity,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
  },
  cardContent: {
    marginTop: 10,
  },

  // Button Styles
  button: {
    backgroundColor: theme.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: theme.shadowColor,
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  buttonText: {
    color: theme.textInverse,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // Section Styles
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: theme.cardBackground,
    borderBottomWidth: 2,
    borderBottomColor: theme.primary,
    marginBottom: 1,
  },
  sectionHeaderText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.primary,
    flex: 1,
  },

  // Status Badge
  statusBadge: {
    backgroundColor: theme.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: theme.textInverse,
    fontSize: 11,
    fontWeight: 'bold',
  },

  // Input Styles
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    color: theme.text,
    backgroundColor: theme.cardBackground,
  },
  inputLabel: {
    fontWeight: '600',
    marginBottom: 4,
    color: theme.text,
  },

  // Settings Screen Styles
  settingsContainer: {
    flex: 1,
  },
  settingsTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.text,
    marginBottom: 20,
  },
  viewDataButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.cardBackground,
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  viewDataButtonText: {
    marginLeft: 10,
    fontSize: 15,
    color: theme.text,
    fontWeight: '500',
  },
  logoutButton: {
    backgroundColor: theme.primary,
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  logoutButtonText: {
    color: theme.textInverse,
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },

  // Local Data Display
  localDataContainer: {
    marginTop: 15,
    backgroundColor: theme.cardBackground,
    borderRadius: 8,
    padding: 15,
    maxHeight: 300,
    borderWidth: 1,
    borderColor: theme.border,
  },
  localDataHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  localDataTitle: {
    fontWeight: '600',
    fontSize: 16,
    color: theme.text,
  },
  localDataScroll: {
    maxHeight: 250,
  },
  localDataText: {
    fontSize: 12,
    color: theme.textSecondary,
    fontFamily: 'monospace',
  },

  // Payment Styles
  paymentsCard: {
    backgroundColor: theme.cardBackground,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.borderLight,
  },
  paymentTableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: theme.primary,
    marginBottom: 4,
  },
  paymentTableCellHeader: {
    fontWeight: 'bold',
    fontSize: 13,
    color: theme.text,
  },
  paymentTableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.divider,
  },
  paymentTableCell: {
    fontSize: 13,
    color: theme.text,
  },
  addPaymentButton: {
    backgroundColor: theme.accent,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  addPaymentButtonText: {
    color: theme.textInverse,
    fontWeight: '600',
    fontSize: 14,
  },

  // Invoice Styles
  invoiceCard: {
    backgroundColor: theme.cardBackground,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.borderLight,
  },
  invoiceTableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: theme.primary,
    marginBottom: 4,
  },
  invoiceTableCellHeader: {
    fontWeight: 'bold',
    fontSize: 13,
    color: theme.text,
    textAlign: 'center',
  },
  invoiceTableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.divider,
    alignItems: 'center',
  },
  invoiceTableCell: {
    fontSize: 13,
    color: theme.text,
    textAlign: 'center',
  },
  invoiceSummaryContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: theme.primary,
  },
  invoiceSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  invoiceSummaryLabel: {
    fontSize: 14,
    color: theme.text,
    fontWeight: '500',
  },
  invoiceSummaryValue: {
    fontSize: 14,
    color: theme.text,
    fontWeight: '600',
  },
  editInvoiceButton: {
    backgroundColor: theme.success,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  editInvoiceButtonText: {
    color: theme.textInverse,
    fontWeight: '600',
    fontSize: 14,
  },

  // Calendar Styles
  calendarContainer: {
    backgroundColor: theme.cardBackground,
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.borderLight,
  },
  calendarTaskCard: {
    backgroundColor: theme.cardBackground,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: theme.primary,
    borderWidth: 1,
    borderColor: theme.borderLight,
  },
  calendarTaskId: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.text,
    marginBottom: 4,
  },
  calendarTaskDetails: {
    fontSize: 12,
    color: theme.textSecondary,
  },
});
