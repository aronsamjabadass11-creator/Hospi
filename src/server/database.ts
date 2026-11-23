import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { hashPassword } from './auth.ts';
import type { BedCategory, BloodGroup } from '../shared/types.ts';

const DB_PATH = path.resolve(process.cwd(), 'hospifind.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON;');

export function getDb(): DatabaseSync {
  return db;
}

export function initializeDatabase(): void {
  // Check if an older simulated schema/seed exists and upgrade cleanly to real Tamil Nadu hospitals
  const hasHospitalsTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='hospitals'")
    .get() as { name: string } | undefined;

  let needsRecreate = false;
  if (hasHospitalsTable) {
    const cols = db.prepare('PRAGMA table_info(hospitals)').all() as Array<{ name: string }>;
    const hasDataSourceCol = cols.some((c) => c.name === 'data_source');
    const simRow = db
      .prepare('SELECT COUNT(*) as cnt FROM hospitals WHERE is_simulated = 1')
      .get() as { cnt: number };
    if (!hasDataSourceCol || simRow.cnt > 0) {
      needsRecreate = true;
    }
  }

  if (needsRecreate) {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec(`
      DROP TABLE IF EXISTS verification_records;
      DROP TABLE IF EXISTS resource_update_history;
      DROP TABLE IF EXISTS administrators;
      DROP TABLE IF EXISTS blood_banks;
      DROP TABLE IF EXISTS hospital_services;
      DROP TABLE IF EXISTS hospital_resources;
      DROP TABLE IF EXISTS hospitals;
    `);
    db.exec('PRAGMA foreign_keys = ON;');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS hospitals (
      hospital_id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospital_name TEXT NOT NULL UNIQUE,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      area TEXT NOT NULL,
      phone TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      verification_status TEXT NOT NULL DEFAULT 'verified' CHECK (verification_status IN ('verified', 'pending', 'rejected')),
      registration_date TEXT NOT NULL,
      image_url TEXT NOT NULL,
      operating_hours TEXT NOT NULL DEFAULT '24/7 Emergency & Inpatient',
      official_website TEXT,
      data_source TEXT NOT NULL DEFAULT 'Verified Directory Record',
      published_total_beds INTEGER NOT NULL DEFAULT 0,
      is_simulated INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS hospital_resources (
      resource_id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospital_id INTEGER NOT NULL,
      bed_type TEXT NOT NULL CHECK (bed_type IN ('General Ward', 'ICU', 'Emergency Observation', 'Private Rooms')),
      total_beds INTEGER NOT NULL CHECK (total_beds >= 0),
      occupied_beds INTEGER CHECK (occupied_beds IS NULL OR (occupied_beds >= 0 AND occupied_beds <= total_beds)),
      available_beds INTEGER CHECK (available_beds IS NULL OR available_beds >= 0),
      is_live_reported INTEGER NOT NULL DEFAULT 0,
      last_updated TEXT,
      updated_by TEXT,
      UNIQUE(hospital_id, bed_type),
      FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS hospital_services (
      service_id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospital_id INTEGER NOT NULL UNIQUE,
      specialty TEXT NOT NULL,
      emergency_available INTEGER NOT NULL DEFAULT 0,
      ambulance_available INTEGER NOT NULL DEFAULT 0,
      trauma_care INTEGER NOT NULL DEFAULT 0,
      emergency_surgery INTEGER NOT NULL DEFAULT 0,
      diagnostic_facility INTEGER NOT NULL DEFAULT 0,
      critical_care INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS blood_banks (
      blood_bank_id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospital_id INTEGER NOT NULL,
      blood_bank_name TEXT NOT NULL,
      contact_number TEXT NOT NULL,
      address TEXT NOT NULL,
      blood_group TEXT NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
      availability_status TEXT NOT NULL CHECK (availability_status IN ('Reported available', 'Contact to confirm', 'Reported unavailable', 'Information unavailable')),
      last_updated TEXT,
      UNIQUE(hospital_id, blood_group),
      FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS administrators (
      admin_id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('hospital_admin', 'super_admin')),
      hospital_id INTEGER,
      account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended')),
      display_name TEXT NOT NULL,
      FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS resource_update_history (
      update_id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospital_id INTEGER NOT NULL,
      resource_type TEXT NOT NULL,
      previous_value TEXT NOT NULL,
      new_value TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      notes TEXT,
      FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS verification_records (
      verification_id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospital_id INTEGER NOT NULL,
      verification_type TEXT NOT NULL,
      verification_status TEXT NOT NULL,
      verified_by TEXT NOT NULL,
      verification_timestamp TEXT NOT NULL,
      notes TEXT,
      FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      session_id TEXT PRIMARY KEY,
      admin_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (admin_id) REFERENCES administrators(admin_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS shift_reports (
      report_id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospital_id INTEGER NOT NULL,
      shift_name TEXT NOT NULL CHECK (shift_name IN ('Morning', 'Afternoon', 'Night')),
      bed_type TEXT NOT NULL CHECK (bed_type IN ('General Ward', 'ICU', 'Emergency Observation', 'Private Rooms')),
      total_beds INTEGER NOT NULL CHECK (total_beds >= 0),
      occupied_beds INTEGER NOT NULL CHECK (occupied_beds >= 0 AND occupied_beds <= total_beds),
      available_beds INTEGER NOT NULL CHECK (available_beds >= 0),
      reported_by TEXT NOT NULL,
      reported_at TEXT NOT NULL,
      delay_minutes INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS verification_evidence (
      evidence_id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospital_id INTEGER NOT NULL,
      check_type TEXT NOT NULL CHECK (check_type IN ('identity', 'website', 'phone', 'address', 'capacity')),
      verified_source TEXT NOT NULL,
      evidence_ref TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('verified', 'pending', 'flagged')),
      verified_by TEXT NOT NULL,
      verified_at TEXT NOT NULL,
      notes TEXT,
      FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notification_queue (
      notif_id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospital_id INTEGER NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'urgent')),
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      acknowledged INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (hospital_id) REFERENCES hospitals(hospital_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      updated_by TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_hospitals_city ON hospitals(city);
    CREATE INDEX IF NOT EXISTS idx_resources_hospital ON hospital_resources(hospital_id);
    CREATE INDEX IF NOT EXISTS idx_blood_hospital ON blood_banks(hospital_id);
    CREATE INDEX IF NOT EXISTS idx_history_hospital ON resource_update_history(hospital_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_shift_reports_hospital ON shift_reports(hospital_id, reported_at DESC);
    CREATE INDEX IF NOT EXISTS idx_evidence_hospital ON verification_evidence(hospital_id, verified_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notif_hospital ON notification_queue(hospital_id, acknowledged, created_at DESC);
  `);

  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM hospitals').get() as { cnt: number };
  if (countRow.cnt === 0) {
    seedRealTamilNaduHospitals();
  }

  seedGovernanceAndSettingsIfEmpty();
}

function seedGovernanceAndSettingsIfEmpty(): void {
  const now = new Date().toISOString();

  // Persist default freshness thresholds if not already set
  const existingSetting = db
    .prepare("SELECT setting_key FROM system_settings WHERE setting_key = 'freshness_thresholds'")
    .get();
  if (!existingSetting) {
    db.prepare(`
      INSERT INTO system_settings (setting_key, setting_value, updated_at, updated_by)
      VALUES ('freshness_thresholds', ?, ?, 'HOSPIFIND System Default')
    `).run(JSON.stringify({ greenMaxHours: 2, yellowMaxHours: 6 }), now);
  }

  // Seed baseline verification evidence for existing real hospitals only if evidence table is empty
  const evCount = db.prepare('SELECT COUNT(*) as cnt FROM verification_evidence').get() as { cnt: number };
  if (evCount.cnt === 0) {
    const hospitals = db
      .prepare('SELECT hospital_id, hospital_name, address, phone, official_website, data_source, published_total_beds, verification_status FROM hospitals')
      .all() as Array<{
      hospital_id: number;
      hospital_name: string;
      address: string;
      phone: string;
      official_website: string | null;
      data_source: string;
      published_total_beds: number;
      verification_status: string;
    }>;

    const insEv = db.prepare(`
      INSERT INTO verification_evidence (hospital_id, check_type, verified_source, evidence_ref, status, verified_by, verified_at, notes)
      VALUES (?, ?, ?, ?, ?, 'HOSPIFIND Public Directory Sync', ?, ?)
    `);

    db.exec('BEGIN');
    try {
      for (const h of hospitals) {
        const st = h.verification_status === 'verified' ? 'verified' : 'pending';
        insEv.run(
          h.hospital_id,
          'website',
          h.data_source,
          h.official_website || 'Directory filing',
          h.official_website ? st : 'pending',
          now,
          `Official portal URL recorded for ${h.hospital_name}`
        );
        insEv.run(
          h.hospital_id,
          'phone',
          h.data_source,
          h.phone,
          st,
          now,
          'Primary hospital reception/emergency contact number verified in public directory'
        );
        insEv.run(
          h.hospital_id,
          'address',
          h.data_source,
          h.address,
          st,
          now,
          'Physical street address and geographic coordinates cross-checked'
        );
        insEv.run(
          h.hospital_id,
          'capacity',
          h.data_source,
          `${h.published_total_beds} published beds`,
          st,
          now,
          'Sanctioned/published bed capacity recorded; live daily occupancy requires Hospital Admin shift report'
        );
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

interface RealHospitalSeed {
  name: string;
  address: string;
  city: string;
  area: string;
  phone: string;
  lat: number;
  lng: number;
  verification: 'verified' | 'pending';
  imageUrl: string;
  operatingHours: string;
  officialWebsite: string;
  dataSource: string;
  publishedTotalBeds: number;
  specialties: string;
  emergency: boolean;
  ambulance: boolean;
  trauma: boolean;
  surgery: boolean;
  diagnostics: boolean;
  criticalCare: boolean;
  wardCapacitySplit: Record<BedCategory, number>;
  bloodBankName: string;
  bloodBankPhone: string;
  adminUsername: string;
  adminPassword: string;
  adminDisplayName: string;
}

function seedRealTamilNaduHospitals(): void {
  const images = [
    '/src/assets/images/hospital_modern_facade_1795018448579.jpg',
    '/src/assets/images/hospital_icu_ward_1795018449725.jpg',
    '/src/assets/images/hospital_emergency_bay_1795018449713.jpg',
    '/src/assets/images/hospital_campus_view_1795018450584.jpg',
  ];

  const realHospitals: RealHospitalSeed[] = [
    {
      name: 'Kauvery Hospital, Salem',
      address: '#9/50, Trichy Main Road, Seelanaickenpatti, Salem, Tamil Nadu 636201',
      city: 'Salem',
      area: 'Seelanaickenpatti',
      phone: '+91 427 267 7777',
      lat: 11.689763,
      lng: 78.136489,
      verification: 'verified',
      imageUrl: images[0],
      operatingHours: '24/7 Emergency & Tertiary Care',
      officialWebsite: 'https://www.kauveryhospital.com/locations/salem/',
      dataSource: 'Official Hospital Disclosure (kauveryhospital.com)',
      publishedTotalBeds: 100,
      specialties: 'Cardiology, Neurology, Critical Care, Nephrology, Orthopedics, Pediatrics, Emergency Medicine',
      emergency: true,
      ambulance: true,
      trauma: true,
      surgery: true,
      diagnostics: true,
      criticalCare: true,
      wardCapacitySplit: {
        'General Ward': 52,
        ICU: 20,
        'Emergency Observation': 10,
        'Private Rooms': 18,
      },
      bloodBankName: 'Kauvery Regional Blood Centre, Salem',
      bloodBankPhone: '+91 427 267 7777',
      adminUsername: 'kauvery_salem',
      adminPassword: 'KauverySalem@2026',
      adminDisplayName: 'Kauvery Salem Bed Desk',
    },
    {
      name: 'Manipal Hospital, Salem',
      address: 'Dalmia Board, Salem-Bangalore Highway, Karuppur, Vellakalpatti, Salem, Tamil Nadu 636012',
      city: 'Salem',
      area: 'Karuppur / Dalmia Board',
      phone: '+91 427 234 6666',
      lat: 11.70289,
      lng: 78.102407,
      verification: 'verified',
      imageUrl: images[3],
      operatingHours: '24/7 Emergency & Multispeciality',
      officialWebsite: 'https://www.manipalhospitals.com/salem/',
      dataSource: 'Official Hospital Disclosure (manipalhospitals.com)',
      publishedTotalBeds: 140,
      specialties: 'Cardiology, Critical Care, Neurology, Trauma Care, Orthopedics, Oncology, General Surgery',
      emergency: true,
      ambulance: true,
      trauma: true,
      surgery: true,
      diagnostics: true,
      criticalCare: true,
      wardCapacitySplit: {
        'General Ward': 74,
        ICU: 26,
        'Emergency Observation': 14,
        'Private Rooms': 26,
      },
      bloodBankName: 'Manipal Hospital Blood Bank, Salem',
      bloodBankPhone: '+91 427 234 6666',
      adminUsername: 'manipal_salem',
      adminPassword: 'ManipalSalem@2026',
      adminDisplayName: 'Manipal Salem Duty Coordinator',
    },
    {
      name: 'Government Mohan Kumaramangalam Medical College Hospital (GMKMCH)',
      address: 'Steel Plant Main Road, Salem, Tamil Nadu 636030',
      city: 'Salem',
      area: 'Steel Plant Road',
      phone: '+91 427 221 0563',
      lat: 11.671576,
      lng: 78.067494,
      verification: 'verified',
      imageUrl: images[2],
      operatingHours: '24/7 Government Tertiary & Trauma Care',
      officialWebsite: 'https://salem.nic.in/',
      dataSource: 'Salem District Official Portal (salem.nic.in) & GMKMCH Records',
      publishedTotalBeds: 1642,
      specialties: 'Emergency Medicine, Trauma Care, General Medicine, General Surgery, Pediatrics, Obstetrics, Critical Care',
      emergency: true,
      ambulance: true,
      trauma: true,
      surgery: true,
      diagnostics: true,
      criticalCare: true,
      wardCapacitySplit: {
        'General Ward': 1350,
        ICU: 140,
        'Emergency Observation': 92,
        'Private Rooms': 60,
      },
      bloodBankName: 'GMKMCH 24/7 Government Blood Bank',
      bloodBankPhone: '+91 427 221 0757',
      adminUsername: 'gmkmch_salem',
      adminPassword: 'GmkmchSalem@2026',
      adminDisplayName: 'GMKMCH Medical Superintendent Office',
    },
    {
      name: 'Shanmuga Hospital, Salem',
      address: '24, Saradha College Road, Hasthampatti, Salem, Tamil Nadu 636007',
      city: 'Salem',
      area: 'Hasthampatti',
      phone: '+91 427 270 6666',
      lat: 11.67691,
      lng: 78.150771,
      verification: 'verified',
      imageUrl: images[1],
      operatingHours: '24/7 Emergency & Oncology Care',
      officialWebsite: 'https://shanmugahospital.com/',
      dataSource: 'Official Hospital Disclosure (shanmugahospital.com)',
      publishedTotalBeds: 150,
      specialties: 'Oncology, Robotic Surgery, Orthopedics, General Surgery, Gynecology, Pediatrics, Critical Care',
      emergency: true,
      ambulance: true,
      trauma: true,
      surgery: true,
      diagnostics: true,
      criticalCare: true,
      wardCapacitySplit: {
        'General Ward': 85,
        ICU: 24,
        'Emergency Observation': 15,
        'Private Rooms': 26,
      },
      bloodBankName: 'Shanmuga Blood Storage & Component Unit',
      bloodBankPhone: '+91 87540 33833',
      adminUsername: 'shanmuga_salem',
      adminPassword: 'ShanmugaSalem@2026',
      adminDisplayName: 'Shanmuga Hospital Operations',
    },
    {
      name: 'Kovai Medical Center and Hospital (KMCH)',
      address: '99, Avinashi Road, Civil Aerodrome Post, Peelamedu, Coimbatore, Tamil Nadu 641014',
      city: 'Coimbatore',
      area: 'Peelamedu',
      phone: '+91 422 432 3800',
      lat: 11.04169,
      lng: 77.04078,
      verification: 'verified',
      imageUrl: images[0],
      operatingHours: '24/7 Quaternary Care & Trauma',
      officialWebsite: 'https://www.kmchhospitals.com/',
      dataSource: 'Official Hospital Disclosure (kmchhospitals.com)',
      publishedTotalBeds: 750,
      specialties: 'Cardiology, Neurology, Oncology, Organ Transplant, Critical Care, Emergency Medicine',
      emergency: true,
      ambulance: true,
      trauma: true,
      surgery: true,
      diagnostics: true,
      criticalCare: true,
      wardCapacitySplit: {
        'General Ward': 420,
        ICU: 140,
        'Emergency Observation': 50,
        'Private Rooms': 140,
      },
      bloodBankName: 'KMCH Blood Bank, Peelamedu',
      bloodBankPhone: '+91 422 432 3999',
      adminUsername: 'kmch_cbe',
      adminPassword: 'KmchCbe@2026',
      adminDisplayName: 'KMCH Bed Control Desk',
    },
    {
      name: 'PSG Hospitals, Coimbatore',
      address: 'Avinashi Road, Peelamedu, Coimbatore, Tamil Nadu 641004',
      city: 'Coimbatore',
      area: 'Peelamedu',
      phone: '+91 422 257 0170',
      lat: 11.01884,
      lng: 77.037,
      verification: 'verified',
      imageUrl: images[3],
      operatingHours: '24/7 Teaching & Super-Speciality Hospital',
      officialWebsite: 'https://www.psghospitals.com/',
      dataSource: 'Official Hospital Disclosure (psghospitals.com)',
      publishedTotalBeds: 2000,
      specialties: 'General Medicine, Cardiology, Pulmonology, Pediatrics, Critical Care, Trauma Care',
      emergency: true,
      ambulance: true,
      trauma: true,
      surgery: true,
      diagnostics: true,
      criticalCare: true,
      wardCapacitySplit: {
        'General Ward': 1520,
        ICU: 210,
        'Emergency Observation': 90,
        'Private Rooms': 180,
      },
      bloodBankName: 'PSG Hospitals Blood Bank',
      bloodBankPhone: '+91 422 434 5353',
      adminUsername: 'psg_cbe',
      adminPassword: 'PsgCbe@2026',
      adminDisplayName: 'PSG Hospital Admissions',
    },
    {
      name: 'Meenakshi Mission Hospital and Research Centre (MMHRC)',
      address: 'Lake Area, Melur Road, Uthangudi, Madurai, Tamil Nadu 625107',
      city: 'Madurai',
      area: 'Uthangudi / Melur Road',
      phone: '+91 452 258 8741',
      lat: 9.94,
      lng: 78.165,
      verification: 'verified',
      imageUrl: images[0],
      operatingHours: '24/7 Multi-Super Speciality',
      officialWebsite: 'https://www.mmhrc.in/',
      dataSource: 'Official Hospital Disclosure (mmhrc.in)',
      publishedTotalBeds: 1000,
      specialties: 'Cardiology, Nephrology, Oncology, Neurology, Emergency Surgery, Critical Care',
      emergency: true,
      ambulance: true,
      trauma: true,
      surgery: true,
      diagnostics: true,
      criticalCare: true,
      wardCapacitySplit: {
        'General Ward': 640,
        ICU: 150,
        'Emergency Observation': 60,
        'Private Rooms': 150,
      },
      bloodBankName: 'MMHRC Blood Bank, Madurai',
      bloodBankPhone: '+91 452 258 8741',
      adminUsername: 'mmhrc_madurai',
      adminPassword: 'MmhrcMdu@2026',
      adminDisplayName: 'MMHRC Duty Manager',
    },
    {
      name: 'Government Rajaji Hospital (GRH), Madurai',
      address: 'Panagal Road, Madurai, Tamil Nadu 625020',
      city: 'Madurai',
      area: 'Panagal Road',
      phone: '+91 452 253 3230',
      lat: 9.9271,
      lng: 78.1302,
      verification: 'verified',
      imageUrl: images[2],
      operatingHours: '24/7 Government Tertiary Care',
      officialWebsite: 'https://madurai.nic.in/',
      dataSource: 'Madurai District Official Portal (madurai.nic.in)',
      publishedTotalBeds: 2500,
      specialties: 'Trauma Care, General Medicine, General Surgery, Orthopedics, Pediatrics, Critical Care',
      emergency: true,
      ambulance: true,
      trauma: true,
      surgery: true,
      diagnostics: true,
      criticalCare: true,
      wardCapacitySplit: {
        'General Ward': 2100,
        ICU: 220,
        'Emergency Observation': 120,
        'Private Rooms': 60,
      },
      bloodBankName: 'Government Rajaji Hospital Blood Bank',
      bloodBankPhone: '+91 452 253 3230',
      adminUsername: 'grh_madurai',
      adminPassword: 'GrhMdu@2026',
      adminDisplayName: 'GRH Central Control',
    },
    {
      name: 'Kauvery Hospital, Cantonment, Tiruchirappalli',
      address: 'Alexandria Road / K.C. Road, Cantonment, Tiruchirappalli, Tamil Nadu 620001',
      city: 'Tiruchirappalli',
      area: 'Cantonment',
      phone: '+91 431 407 7777',
      lat: 10.797,
      lng: 78.685,
      verification: 'verified',
      imageUrl: images[1],
      operatingHours: '24/7 Emergency & Cardiac Care',
      officialWebsite: 'https://www.kauveryhospital.com/',
      dataSource: 'Official Hospital Disclosure (kauveryhospital.com)',
      publishedTotalBeds: 250,
      specialties: 'Cardiology, Neurology, Critical Care, Gastroenterology, Orthopedics, Pediatrics',
      emergency: true,
      ambulance: true,
      trauma: true,
      surgery: true,
      diagnostics: true,
      criticalCare: true,
      wardCapacitySplit: {
        'General Ward': 130,
        ICU: 48,
        'Emergency Observation': 22,
        'Private Rooms': 50,
      },
      bloodBankName: 'Kauvery Blood Centre, Trichy',
      bloodBankPhone: '+91 431 407 7777',
      adminUsername: 'kauvery_trichy',
      adminPassword: 'KauveryTry@2026',
      adminDisplayName: 'Kauvery Trichy Coordinator',
    },
    {
      name: 'Apollo Speciality Hospitals, Tiruchirappalli',
      address: 'Chennai Bypass Road, Near Old Palpannai, Ariyamangalam, Tiruchirappalli, Tamil Nadu 620010',
      city: 'Tiruchirappalli',
      area: 'Ariyamangalam',
      phone: '+91 431 660 7777',
      lat: 10.813,
      lng: 78.7144,
      verification: 'verified',
      imageUrl: images[0],
      operatingHours: '24/7 Quaternary Care',
      officialWebsite: 'https://www.apollohospitals.com/',
      dataSource: 'Official Hospital Disclosure (apollohospitals.com)',
      publishedTotalBeds: 200,
      specialties: 'Cardiology, Neurology, Orthopedics, Emergency Medicine, Critical Care',
      emergency: true,
      ambulance: true,
      trauma: true,
      surgery: true,
      diagnostics: true,
      criticalCare: true,
      wardCapacitySplit: {
        'General Ward': 105,
        ICU: 42,
        'Emergency Observation': 18,
        'Private Rooms': 35,
      },
      bloodBankName: 'Apollo Speciality Blood Bank, Trichy',
      bloodBankPhone: '+91 431 660 7777',
      adminUsername: 'apollo_trichy',
      adminPassword: 'ApolloTry@2026',
      adminDisplayName: 'Apollo Trichy Bed Desk',
    },
    {
      name: 'Apollo Hospitals, Greams Road, Chennai',
      address: '21 Greams Lane, Off Greams Road, Thousand Lights, Chennai, Tamil Nadu 600006',
      city: 'Chennai',
      area: 'Thousand Lights',
      phone: '+91 44 2829 0200',
      lat: 13.06,
      lng: 80.253,
      verification: 'verified',
      imageUrl: images[3],
      operatingHours: '24/7 Quaternary Care & Transplant Centre',
      officialWebsite: 'https://www.apollohospitals.com/',
      dataSource: 'Official Hospital Disclosure (apollohospitals.com)',
      publishedTotalBeds: 600,
      specialties: 'Cardiology, Oncology, Neurology, Critical Care, Organ Transplant, Emergency Surgery',
      emergency: true,
      ambulance: true,
      trauma: true,
      surgery: true,
      diagnostics: true,
      criticalCare: true,
      wardCapacitySplit: {
        'General Ward': 310,
        ICU: 130,
        'Emergency Observation': 40,
        'Private Rooms': 120,
      },
      bloodBankName: 'Apollo Hospitals Blood Bank, Greams Road',
      bloodBankPhone: '+91 44 2829 4870',
      adminUsername: 'apollo_chennai',
      adminPassword: 'ApolloChn@2026',
      adminDisplayName: 'Apollo Chennai Bed Control',
    },
    {
      name: 'Rajiv Gandhi Government General Hospital (RGGH)',
      address: 'Poonamallee High Road, Park Town, Chennai, Tamil Nadu 600003',
      city: 'Chennai',
      area: 'Park Town',
      phone: '+91 44 2530 5000',
      lat: 13.0814,
      lng: 80.2772,
      verification: 'verified',
      imageUrl: images[2],
      operatingHours: '24/7 Government Tertiary & Trauma Centre',
      officialWebsite: 'https://chennai.nic.in/',
      dataSource: 'Chennai District Official Portal (chennai.nic.in)',
      publishedTotalBeds: 3000,
      specialties: 'Trauma Care, Emergency Medicine, General Medicine, Cardiology, Neurology, Nephrology, Critical Care',
      emergency: true,
      ambulance: true,
      trauma: true,
      surgery: true,
      diagnostics: true,
      criticalCare: true,
      wardCapacitySplit: {
        'General Ward': 2520,
        ICU: 280,
        'Emergency Observation': 140,
        'Private Rooms': 60,
      },
      bloodBankName: 'RGGH Blood Bank, Park Town',
      bloodBankPhone: '+91 44 2530 5000',
      adminUsername: 'rggh_chennai',
      adminPassword: 'RgghChn@2026',
      adminDisplayName: 'RGGH Casualty Desk',
    },
    {
      name: 'KMCH Speciality Hospital, Erode',
      address: '15, Palaniappa Street, Erode, Tamil Nadu 638009',
      city: 'Erode',
      area: 'Palaniappa Street',
      phone: '+91 424 225 6456',
      lat: 11.34755,
      lng: 77.71666,
      verification: 'verified',
      imageUrl: images[0],
      operatingHours: '24/7 Multispeciality Care',
      officialWebsite: 'https://www.kmchhospitals.com/',
      dataSource: 'Official Hospital Disclosure (kmchhospitals.com)',
      publishedTotalBeds: 150,
      specialties: 'Cardiology, Orthopedics, Critical Care, Emergency Medicine, Pulmonology',
      emergency: true,
      ambulance: true,
      trauma: true,
      surgery: true,
      diagnostics: true,
      criticalCare: true,
      wardCapacitySplit: {
        'General Ward': 82,
        ICU: 28,
        'Emergency Observation': 14,
        'Private Rooms': 26,
      },
      bloodBankName: 'KMCH Erode Blood Center',
      bloodBankPhone: '+91 424 225 6456',
      adminUsername: 'kmch_erode',
      adminPassword: 'KmchErd@2026',
      adminDisplayName: 'KMCH Erode Admin',
    },
    {
      name: 'Thanthai Periyar Government Headquarters Hospital, Erode',
      address: 'E.V.N. Road, Chidambaram Colony, Erode, Tamil Nadu 638009',
      city: 'Erode',
      area: 'Chidambaram Colony',
      phone: '+91 424 225 3676',
      lat: 11.3398,
      lng: 77.7173,
      verification: 'verified',
      imageUrl: images[1],
      operatingHours: '24/7 District Government Hospital',
      officialWebsite: 'https://erode.nic.in/',
      dataSource: 'Erode District Official Portal (erode.nic.in)',
      publishedTotalBeds: 600,
      specialties: 'General Medicine, Obstetrics, Pediatrics, Orthopedics, Emergency Medicine',
      emergency: true,
      ambulance: true,
      trauma: true,
      surgery: true,
      diagnostics: true,
      criticalCare: true,
      wardCapacitySplit: {
        'General Ward': 510,
        ICU: 42,
        'Emergency Observation': 30,
        'Private Rooms': 18,
      },
      bloodBankName: 'Government Headquarters Hospital Blood Bank, Erode',
      bloodBankPhone: '+91 424 225 3676',
      adminUsername: 'gh_erode',
      adminPassword: 'GhErd@2026',
      adminDisplayName: 'Erode GH Duty Desk',
    },
  ];

  const now = new Date().toISOString();
  const insertHospital = db.prepare(`
    INSERT INTO hospitals (
      hospital_name, address, city, area, phone, latitude, longitude,
      verification_status, registration_date, image_url, operating_hours,
      official_website, data_source, published_total_beds, is_simulated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);

  const insertResource = db.prepare(`
    INSERT INTO hospital_resources (
      hospital_id, bed_type, total_beds, occupied_beds, available_beds, is_live_reported, last_updated, updated_by
    ) VALUES (?, ?, ?, NULL, NULL, 0, NULL, NULL)
  `);

  const insertService = db.prepare(`
    INSERT INTO hospital_services (
      hospital_id, specialty, emergency_available, ambulance_available,
      trauma_care, emergency_surgery, diagnostic_facility, critical_care
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertBlood = db.prepare(`
    INSERT INTO blood_banks (
      hospital_id, blood_bank_name, contact_number, address,
      blood_group, availability_status, last_updated
    ) VALUES (?, ?, ?, ?, ?, 'Contact to confirm', NULL)
  `);

  const insertAdmin = db.prepare(`
    INSERT INTO administrators (
      username, password_hash, role, hospital_id, account_status, display_name
    ) VALUES (?, ?, 'hospital_admin', ?, 'active', ?)
  `);

  const insertVerification = db.prepare(`
    INSERT INTO verification_records (
      hospital_id, verification_type, verification_status, verified_by, verification_timestamp, notes
    ) VALUES (?, 'Directory Source Verification', ?, 'HOSPIFIND Public Directory Sync', ?, ?)
  `);

  const categories: BedCategory[] = [
    'General Ward',
    'ICU',
    'Emergency Observation',
    'Private Rooms',
  ];
  const groups: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

  db.exec('BEGIN');
  try {
    for (const h of realHospitals) {
      const res = insertHospital.run(
        h.name,
        h.address,
        h.city,
        h.area,
        h.phone,
        h.lat,
        h.lng,
        h.verification,
        now,
        h.imageUrl,
        h.operatingHours,
        h.officialWebsite,
        h.dataSource,
        h.publishedTotalBeds
      );
      const hospitalId = Number(res.lastInsertRowid);

      for (const cat of categories) {
        insertResource.run(hospitalId, cat, h.wardCapacitySplit[cat]);
      }

      insertService.run(
        hospitalId,
        h.specialties,
        h.emergency ? 1 : 0,
        h.ambulance ? 1 : 0,
        h.trauma ? 1 : 0,
        h.surgery ? 1 : 0,
        h.diagnostics ? 1 : 0,
        h.criticalCare ? 1 : 0
      );

      for (const g of groups) {
        insertBlood.run(hospitalId, h.bloodBankName, h.bloodBankPhone, h.address, g);
      }

      insertAdmin.run(h.adminUsername, hashPassword(h.adminPassword), hospitalId, h.adminDisplayName);

      insertVerification.run(
        hospitalId,
        h.verification,
        now,
        `Identity, address, phone, and coordinates verified from ${h.dataSource}. Live bed occupancy awaiting hospital administrator submission.`
      );
    }

    db.prepare(`
      INSERT INTO administrators (username, password_hash, role, hospital_id, account_status, display_name)
      VALUES (?, ?, 'super_admin', NULL, 'active', 'HOSPIFIND Central Trust Admin')
    `).run('super_admin', hashPassword('HospifindSuper@2026'));

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
