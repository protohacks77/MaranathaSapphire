import { Bill, InventoryItem } from '../../types';

export interface BilledMedicationLine {
    index: number;
    name: string;
    inventoryItemId?: string;
    billed: number;
    dispensed: number;
    remaining: number;
    available: number;
}

export function billedMedicationLines(bill: Bill, inventory: InventoryItem[]): BilledMedicationLine[] {
    return bill.items.flatMap((item, index) => {
        const stock = item.inventoryItemId
            ? inventory.find(entry => entry.id === item.inventoryItemId)
            : inventory.find(entry => entry.name === item.description);
        if (!stock && !item.inventoryItemId && item.department !== 'Pharmacy') return [];
        const dispensed = bill.dispensedQuantities?.[String(index)] ?? 0;
        return [{ index, name: item.description, inventoryItemId: item.inventoryItemId || stock?.id,
            billed: item.quantity, dispensed, remaining: Math.max(0, item.quantity - dispensed), available: stock?.quantity ?? 0 }];
    });
}

export function dispensingProblem(lines: BilledMedicationLine[]): string {
    const totals = new Map<string, number>();
    for (const line of lines.filter(line => line.remaining > 0)) {
        if (!line.inventoryItemId) return `${line.name} is not linked to an inventory item. Add its stock before dispensing.`;
        if (!Number.isSafeInteger(line.billed) || !Number.isSafeInteger(line.dispensed) || line.dispensed < 0 || !Number.isSafeInteger(line.remaining)) return `Check the billed quantity for ${line.name}.`;
        const total = (totals.get(line.inventoryItemId) ?? 0) + line.remaining;
        totals.set(line.inventoryItemId, total);
        if (!Number.isSafeInteger(line.available) || line.available < total) return `Insufficient stock for ${line.name}. Restock before dispensing.`;
    }
    return '';
}
