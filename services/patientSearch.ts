import { db } from './firebase';
import { cachedRead } from './readCache';
import { Patient } from '../types';

export function searchPrefixes(name: string, surname: string, hospitalNumber: string): string[] {
    const values = [name, surname, `${name} ${surname}`, `${surname} ${name}`, hospitalNumber,
        ...`${name} ${surname}`.split(/\s+/)].map(value => value.trim().toLowerCase());
    const prefixes = new Set<string>();
    for (const value of values) for (let length = 2; length <= Math.min(value.length, 64); length++) prefixes.add(value.slice(0, length));
    return [...prefixes];
}
export const patientSearchFields = (name: string, surname: string, hospitalNumber: string) => ({
    nameLower: name.trim().toLowerCase(), surnameLower: surname.trim().toLowerCase(),
    searchPrefixes: searchPrefixes(name, surname, hospitalNumber),
});
export async function searchPatients(value: string, limit = 8) {
    const normalized = value.trim().toLowerCase();
    if (normalized.length < 2) return [];
    return cachedRead(`patient-search:${normalized}:${limit}`, async () => {
        const snapshot = await db.collection('patients').where('searchPrefixes', 'array-contains', normalized).limit(limit).get();
        return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Patient));
    }, 30_000);
}
export function userSearchPrefixes(name: string, surname: string, email: string, role: string, department: string) {
    return [...new Set([...searchPrefixes(name, surname, email), ...searchPrefixes(role, department, '')])];
}

export async function searchPriceItems(value: string) {
    const normalized = value.trim().toLowerCase();
    if (normalized.length < 2) return [];
    return cachedRead(`price-search:${normalized}`, async () => {
        const snapshot = await db.collection('priceList').where('searchPrefixes', 'array-contains', normalized).limit(8).get();
        return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as import('../types').PriceListItem));
    }, 30_000);
}
