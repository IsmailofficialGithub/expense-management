import { documentDirectory, EncodingType, writeAsStringAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Expense } from '../types/database.types';
import { format } from 'date-fns';

export class CsvService {
    static async generateAndShareExpenseReport(
        expenses: Expense[],
        fileName: string = 'expense_report'
    ) {
        try {
            const csvContent = this.convertToCSV(expenses);
            const fileUri = `${documentDirectory}${fileName}.csv`;

            // Write to file
            await writeAsStringAsync(fileUri, csvContent, {
                encoding: EncodingType.UTF8,
            });

            // Share file
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri, {
                    mimeType: 'text/csv',
                    dialogTitle: 'Download Expense Report',
                });
            } else {
                throw new Error('Sharing is not available on this device');
            }
        } catch (error) {
            console.error('Error generating CSV:', error);
            throw error;
        }
    }

    private static convertToCSV(expenses: Expense[]): string {
        const header = [
            'Date',
            'Description',
            'Amount',
            'Paid By',
            'Category',
            'Group',
            'Split Details'
        ].join(',');

        const rows = expenses.map(expense => {
            const date = format(new Date(expense.date), 'yyyy-MM-dd');
            const description = this.escapeCsvField(expense.description);
            const amount = expense.amount;
            const paidBy = this.escapeCsvField((expense as any).paid_by_user?.full_name || 'Unknown');
            const category = this.escapeCsvField((expense as any).category?.name || 'Uncategorized');
            const group = 'Group Expense';

            // Create a summary of splits
            const splitDetails = (expense as any).splits?.map((split: any) =>
                `${split.user?.full_name || 'User'}: ${split.amount}`
            ).join('; ');

            const escapedSplits = this.escapeCsvField(splitDetails || '');

            return [
                date,
                description,
                amount,
                paidBy,
                category,
                group,
                escapedSplits
            ].join(',');
        });

        return [header, ...rows].join('\n');
    }

    private static escapeCsvField(field: string): string {
        if (!field) return '';
        // If field contains comma, quote, or newline, wrap in quotes and escape internal quotes
        if (field.includes(',') || field.includes('"') || field.includes('\n')) {
            return `"${field.replace(/"/g, '""')}"`;
        }
        return field;
    }
}
