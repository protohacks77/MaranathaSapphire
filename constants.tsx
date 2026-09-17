import React from 'react';
import { Role } from './types';
import { 
  Users, LayoutDashboard, Stethoscope, FileText, Microscope, Bone, Pill, Activity, Settings, UserPlus, FilePlus, DollarSign, FileBarChart, UserCheck, BedDouble, MessageSquare 
} from 'lucide-react';

export const sidebarNavLinks = {
  [Role.Admin]: [
    { label: 'Dashboard', href: '/', icon: <LayoutDashboard size={20} /> },
    { label: 'Analytics', href: '/admin/analytics', icon: <FileBarChart size={20} /> },
    { label: 'Reports', href: '/accounts/reports', icon: <FileBarChart size={20} /> },
    { label: 'User Management', href: '/admin/users', icon: <Users size={20} /> },
    { label: 'Ward Management', href: '/admin/wards', icon: <BedDouble size={20} /> },
    { label: 'Patient Management', href: '/accounts/patients', icon: <Users size={20} /> },
    { label: 'Messages', href: '/messages', icon: <MessageSquare size={20} /> },
    { label: 'Stationaries', href: '/stationaries', icon: <FileText size={20} /> },
    { label: 'Settings', href: '/settings', icon: <Settings size={20} /> },
  ],
  [Role.Doctor]: [
    { label: 'Dashboard', href: '/', icon: <LayoutDashboard size={20} /> },
    { label: 'Find Patient', href: '/accounts/patients', icon: <Users size={20} /> },
    { label: 'Messages', href: '/messages', icon: <MessageSquare size={20} /> },
    { label: 'Stationaries', href: '/stationaries', icon: <FileText size={20} /> },
    { label: 'Settings', href: '/settings', icon: <Settings size={20} /> },
  ],
  [Role.Accountant]: [
    { label: 'Dashboard', href: '/', icon: <LayoutDashboard size={20} /> },
    { label: 'Register Patient', href: '/accounts/register', icon: <UserPlus size={20} /> },
    { label: 'All Patients', href: '/accounts/patients', icon: <Users size={20} /> },
    { label: 'Discharge Approval', href: '/accounts/discharge-approval', icon: <UserCheck size={20} /> },
    { label: 'Price List', href: '/accounts/pricelist', icon: <DollarSign size={20} /> },
    { label: 'Inventory', href: '/pharmacy/inventory', icon: <Pill size={20} /> },
    { label: 'Reports', href: '/accounts/reports', icon: <FileBarChart size={20} /> },
    { label: 'Messages', href: '/messages', icon: <MessageSquare size={20} /> },
    { label: 'Stationaries', href: '/stationaries', icon: <FileText size={20} /> },
    { label: 'Settings', href: '/settings', icon: <Settings size={20} /> },
  ],
   [Role.AccountsAssistant]: [
    { label: 'Dashboard', href: '/', icon: <LayoutDashboard size={20} /> },
    { label: 'Register Patient', href: '/accounts/register', icon: <UserPlus size={20} /> },
    { label: 'Find Patient', href: '/accounts/patients', icon: <Users size={20} /> },
    { label: 'Billing', href: '/accounts/billing', icon: <DollarSign size={20} /> },
    { label: 'Discharge Approval', href: '/accounts/discharge-approval', icon: <UserCheck size={20} /> },
    { label: 'Messages', href: '/messages', icon: <MessageSquare size={20} /> },
    { label: 'Stationaries', href: '/stationaries', icon: <FileText size={20} /> },
    { label: 'Settings', href: '/settings', icon: <Settings size={20} /> },
  ],
  [Role.AccountsClerk]: [
    { label: 'Dashboard', href: '/', icon: <LayoutDashboard size={20} /> },
    { label: 'Register Patient', href: '/accounts/register', icon: <UserPlus size={20} /> },
    { label: 'Find Patient', href: '/accounts/patients', icon: <Users size={20} /> },
    { label: 'Billing', href: '/accounts/billing', icon: <DollarSign size={20} /> },
    { label: 'Discharge Approval', href: '/accounts/discharge-approval', icon: <UserCheck size={20} /> },
    { label: 'Messages', href: '/messages', icon: <MessageSquare size={20} /> },
    { label: 'Stationaries', href: '/stationaries', icon: <FileText size={20} /> },
    { label: 'Settings', href: '/settings', icon: <Settings size={20} /> },
  ],
   [Role.Nurse]: [
    { label: 'Dashboard', href: '/', icon: <LayoutDashboard size={20} /> },
    { label: 'Find Patient', href: '/accounts/patients', icon: <FilePlus size={20} /> },
    { label: 'Messages', href: '/messages', icon: <MessageSquare size={20} /> },
    { label: 'Stationaries', href: '/stationaries', icon: <FileText size={20} /> },
    { label: 'Settings', href: '/settings', icon: <Settings size={20} /> },
  ],
  // Add other roles here
};

const clinicalAndSupportStaffLinks = [
    { label: 'Dashboard', href: '/', icon: <LayoutDashboard size={20} /> },
    { label: 'Find Patient', href: '/accounts/patients', icon: <Users size={20} /> },
    { label: 'Messages', href: '/messages', icon: <MessageSquare size={20} /> },
    { label: 'Stationaries', href: '/stationaries', icon: <FileText size={20} /> },
    { label: 'Settings', href: '/settings', icon: <Settings size={20} /> },
];

const pharmacyStaffLinks = [
    { label: 'Dashboard', href: '/', icon: <LayoutDashboard size={20} /> },
    { label: 'Inventory', href: '/pharmacy/inventory', icon: <Pill size={20} /> },
    { label: 'Find Patient', href: '/accounts/patients', icon: <Users size={20} /> },
    { label: 'Messages', href: '/messages', icon: <MessageSquare size={20} /> },
    { label: 'Stationaries', href: '/stationaries', icon: <FileText size={20} /> },
    { label: 'Settings', href: '/settings', icon: <Settings size={20} /> },
];

export const getNavLinksForRole = (role: Role) => {
    switch (role) {
        case Role.Admin:
            return sidebarNavLinks[Role.Admin];
        case Role.Doctor:
            return sidebarNavLinks[Role.Doctor];
        case Role.Accountant:
            return sidebarNavLinks[Role.Accountant];
        case Role.AccountsAssistant:
            return sidebarNavLinks[Role.AccountsAssistant];
        case Role.AccountsClerk:
            return sidebarNavLinks[Role.AccountsClerk];
        case Role.Nurse:
            return sidebarNavLinks[Role.Nurse];
        case Role.Pharmacist:
        case Role.PharmacyTechnician:
        case Role.DispensaryAssistant:
            return pharmacyStaffLinks;
        case Role.VitalsChecker:
        case Role.LaboratoryTechnician:
        case Role.Radiologist:
        case Role.RehabilitationTechnician:
            return clinicalAndSupportStaffLinks;
        // Default case for roles not explicitly defined yet
        default:
            return [
                { label: 'Dashboard', href: '/', icon: <LayoutDashboard size={20} /> },
                { label: 'Messages', href: '/messages', icon: <MessageSquare size={20} /> },
                { label: 'Stationaries', href: '/stationaries', icon: <FileText size={20} /> },
                { label: 'Settings', href: '/settings', icon: <Settings size={20} /> },
            ];
    }
};

export const departmentRoles: Record<string, Role[]> = {
  'Administration': [Role.Admin],
  'Doctors': [Role.Doctor],
  'Accounts': [Role.Accountant, Role.AccountsAssistant, Role.AccountsClerk],
  'Wards': [Role.Nurse],
  'OPD': [Role.VitalsChecker],
  'Laboratory': [Role.LaboratoryTechnician],
  'Radiology': [Role.Radiologist],
  'Pharmacy': [Role.Pharmacist, Role.PharmacyTechnician, Role.DispensaryAssistant],
  'Rehabilitation': [Role.RehabilitationTechnician],
};