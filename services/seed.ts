import { userSearchPrefixes } from './patientSearch';
import { auth, db } from "./firebase";
import { Role, UserProfile, Ward } from "../types";
import firebase from "firebase/compat/app";

const usersToSeed: Array<{ name: string; surname: string; email: string; password: string; role: Role; department: string; wardId?: string; wardName?: string }> = [
  // Administration - Only Admin User
  { name: 'Admin', surname: 'User', email: 'admin@maranathasapphire.com', password: 'password123', role: Role.Admin, department: 'Administration' },
];

const seedWards = async () => {
    console.log("Checking wards...");
    const wardsCol = db.collection("wards");
    const snapshot = await wardsCol.get();
    if (!snapshot.empty) {
        console.log("Wards already seeded.");
        return;
    }

    console.log("Seeding wards...");
    const wards: Omit<Ward, 'id'>[] = [
        { name: 'Female Ward', totalBeds: 20, pricePerDay: 40 },
        { name: 'Male Ward', totalBeds: 20, pricePerDay: 40 },
        { name: 'Childrens Ward', totalBeds: 15, pricePerDay: 50 },
        { name: 'ICU', totalBeds: 5, pricePerDay: 150 },
        { name: 'Maternity Ward', totalBeds: 10, pricePerDay: 60 },
        { name: 'Theater', totalBeds: 2, pricePerDay: 200 },
    ];

    const batch = db.batch();
    wards.forEach(ward => {
        // Use a predictable ID for seeding purposes
        const docId = ward.name.toLowerCase().replace(' ', '-').replace('\'', '');
        const docRef = wardsCol.doc(docId);
        batch.set(docRef, ward);
    });
    await batch.commit();
    console.log("Wards seeded successfully.");
}

const seedUsers = async () => {
  console.log("Checking if users need to be seeded...");
  const usersCollection = db.collection("users");
  
  let usersSnapshot;
  try {
    usersSnapshot = await usersCollection.get();
  } catch (err) {
    console.warn("Could not query users collection, may not be initialized yet:", err);
    return;
  }

  if (usersSnapshot.docs.length >= usersToSeed.length) {
    console.log("Users collection appears to be seeded. Skipping seeding.");
    return;
  }

  console.log("Seeding users...");
  try {
    for (const userData of usersToSeed) {
      try {
        let uid: string | null = null;
        try {
          const userCredential = await auth.createUserWithEmailAndPassword(userData.email, userData.password);
          uid = userCredential.user?.uid || null;
        } catch (error: any) {
          if (error.code === 'auth/email-already-in-use') {
            console.warn(`User ${userData.email} already exists in Auth. Looking up or signing in to ensure profile...`);
            try {
              const signinCred = await auth.signInWithEmailAndPassword(userData.email, userData.password);
              uid = signinCred.user?.uid || null;
            } catch (loginErr) {
              console.warn(`Could not sign in existing user ${userData.email}:`, loginErr);
            }
          } else {
            console.error(`Error creating user ${userData.email}:`, error);
          }
        }

        if (uid) {
          const userProfile: Omit<UserProfile, 'id'> = {
            name: userData.name,
            surname: userData.surname,
            email: userData.email,
            searchPrefixes: userSearchPrefixes(userData.name, userData.surname, userData.email, userData.role, userData.department),
            role: userData.role,
            department: userData.department,
            ...(userData.wardId && { wardId: userData.wardId }),
            ...(userData.wardName && { wardName: userData.wardName }),
          };
          await db.collection("users").doc(uid).set(userProfile, { merge: true });
          console.log(`Successfully ensured user profile for: ${userData.email}`);
        }
      } catch (error: any) {
        console.error(`Error processing user ${userData.email}:`, error);
      }
    }
    await auth.signOut();
    console.log("User seeding process completed.");
  } catch (error) {
    console.error("A critical error occurred during user seeding:", error);
  }
};

const seedDepartments = async () => {
    console.log("Checking departments...");
    const departmentsCol = db.collection("departments");
    const snapshot = await departmentsCol.get();
    if (!snapshot.empty) {
        console.log("Departments already seeded.");
        return;
    }

    console.log("Seeding departments...");
    const departments = [
        "Administration", "Accounts", "Doctors", "OPD", "Wards",
        "Laboratory", "Radiology", "Pharmacy", "Rehabilitation"
    ];
    const batch = db.batch();
    departments.forEach(name => {
        const docRef = departmentsCol.doc(name.toLowerCase().replace(' ', '-'));
        batch.set(docRef, { name });
    });
    await batch.commit();
    console.log("Departments seeded successfully.");
};

const seedPriceList = async () => {
    console.log("Checking price list...");
    const priceListCol = db.collection("priceList");
    const snapshot = await priceListCol.get();
    if (!snapshot.empty) {
        console.log("Price list already seeded.");
        return;
    }

    console.log("Seeding price list...");
    const items = [
        { name: 'GP Consultation', department: 'OPD', unitPrice: 15.00 },
        { name: 'Paracetamol (strip)', department: 'Pharmacy', unitPrice: 1.50 },
        { name: 'Amoxicillin (strip)', department: 'Pharmacy', unitPrice: 5.00 },
        { name: 'Full Blood Count', department: 'Laboratory', unitPrice: 25.00 },
        { name: 'Malaria Test (RDT)', department: 'Laboratory', unitPrice: 8.00 },
        { name: 'Chest X-Ray', department: 'Radiology', unitPrice: 40.00 },
    ];
    const batch = db.batch();
    items.forEach(item => {
        const docRef = priceListCol.doc();
        batch.set(docRef, { 
            ...item, 
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    });
    await batch.commit();
    console.log("Price list seeded successfully.");
};

const seedPatients = async () => {
    console.log("Checking patients...");
    const patientsCol = db.collection("patients");
    const snapshot = await patientsCol.get();
    if (!snapshot.empty) {
        console.log("Patients already seeded.");
        return;
    }
    console.log("Seeding patients...");
    const patients = [
        {
            hospitalNumber: 'MH0001', name: 'John', surname: 'Doe', dateOfBirth: '1985-05-20', age: 39, maritalStatus: 'Married', gender: 'Male', countryOfBirth: 'Zimbabwe', phoneNumber: '0777111222', residentialAddress: '123 Main St, Harare', nokName: 'Jane', nokSurname: 'Doe', nokPhoneNumber: '0777111223', nokAddress: '123 Main St, Harare', registeredBy: 'dummy_user_id', registrationDate: new Date().toISOString(),
            status: 'Admitted', financials: { totalBill: 0, amountPaid: 0, balance: 0 }, currentWardId: 'male-ward', currentWardName: 'Male Ward', currentBedNumber: 5
        },
        {
            hospitalNumber: 'MH0002', name: 'Mary', surname: 'Moyo', dateOfBirth: '1992-11-10', age: 31, maritalStatus: 'Single', gender: 'Female', countryOfBirth: 'Zimbabwe', phoneNumber: '0777333444', residentialAddress: '456 Park Ave, Masvingo', nokName: 'Peter', nokSurname: 'Moyo', nokPhoneNumber: '0777333445', nokAddress: '456 Park Ave, Masvingo', registeredBy: 'dummy_user_id', registrationDate: new Date().toISOString(),
            status: 'PendingDischarge', financials: { totalBill: 75.50, amountPaid: 50.00, balance: 25.50 }, currentWardId: 'female-ward', currentWardName: 'Female Ward', currentBedNumber: 2
        },
        {
            hospitalNumber: 'MH0003', name: 'Tafadzwa', surname: 'Chauke', dateOfBirth: '2001-01-15', age: 23, maritalStatus: 'Single', gender: 'Male', countryOfBirth: 'Zimbabwe', phoneNumber: '0777555666', residentialAddress: '789 High St, Gweru', nokName: 'Rudo', nokSurname: 'Chauke', nokPhoneNumber: '0777555667', nokAddress: '789 High St, Gweru', registeredBy: 'dummy_user_id', registrationDate: new Date().toISOString(),
            status: 'Discharged', financials: { totalBill: 120.00, amountPaid: 120.00, balance: 0.00 }
        },
    ];
    const batch = db.batch();
    patients.forEach(p => {
        const docRef = patientsCol.doc();
        batch.set(docRef, p);
    });
    await batch.commit();

    // Initialize the counter after seeding patients
    const counterRef = db.collection('counters').doc('patients');
    await counterRef.set({ lastNumber: patients.length });
    console.log(`Patient counter initialized to ${patients.length}.`);

    console.log("Patients seeded successfully.");
}

const seedInventory = async () => {
    console.log("Checking inventory...");
    const inventoryCol = db.collection("inventory");
    const snapshot = await inventoryCol.get();
    if (!snapshot.empty) {
        console.log("Inventory already seeded.");
        return;
    }

    console.log("Seeding inventory...");
    const items = [
        { name: 'Paracetamol 500mg (strip)', category: 'Painkiller', quantity: 200, unitPrice: 1.50, lowStockThreshold: 50 },
        { name: 'Amoxicillin 250mg (strip)', category: 'Antibiotic', quantity: 150, unitPrice: 5.00, lowStockThreshold: 30 },
        { name: 'Ibuprofen 200mg (bottle)', category: 'Painkiller', quantity: 80, unitPrice: 4.20, lowStockThreshold: 20 },
        { name: 'Cough Syrup (100ml)', category: 'Cold & Flu', quantity: 120, unitPrice: 3.00, lowStockThreshold: 40 },
        { name: 'Band-Aids (box)', category: 'First Aid', quantity: 300, unitPrice: 2.50, lowStockThreshold: 100 },
    ];
    const batch = db.batch();
    items.forEach(item => {
        const docRef = inventoryCol.doc();
        batch.set(docRef, { 
            ...item, 
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    });
    await batch.commit();
    console.log("Inventory seeded successfully.");
};


export const seedDatabase = async () => {
  console.log("--- Setting up Admin User ---");
  await seedUsers();
  console.log("--- Admin User Setup Finished ---");
};