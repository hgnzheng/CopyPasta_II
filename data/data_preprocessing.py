import pandas as pd
import numpy as np
from scipy import stats
from datetime import datetime
import json
from pathlib import Path
import re
import os

def load_raw_data():
    """Load raw data files."""
    print("Loading cases.txt...")
    cases = pd.read_csv('cases.txt', low_memory=False)
    print("Loading labs.txt...")
    labs = pd.read_csv('labs.txt', low_memory=False)
    print("Loading trks.txt...")
    tracks = pd.read_csv('trks.txt', low_memory=False)
    return cases, labs, tracks

def extract_operation_type(opname):
    """Extract operation type from operation name using regex patterns."""
    if pd.isna(opname):
        return "Unknown"
    
    opname = str(opname).lower()
    
    # Define regex patterns for common operation types
    patterns = {
        'cardiac': r'(heart|cardiac|coronary|bypass|cabg|valve|aortic|mitral|tricuspid)',
        'neuro': r'(brain|neuro|cranial|spine|spinal|vertebr|laminectomy|discectomy)',
        'ortho': r'(ortho|hip|knee|joint|bone|fracture|arthroplasty|replacement)',
        'general': r'(appendix|appendectomy|gallbladder|cholecystectomy|hernia|bowel|colon|intestine)',
        'thoracic': r'(lung|thorac|chest|lobectomy|pneumonectomy|esophageal)',
        'vascular': r'(vascular|artery|vein|aneurysm|endarterectomy|bypass)',
        'urologic': r'(kidney|bladder|prostate|ureter|urethra|nephrectomy)',
        'gynecologic': r'(uterus|ovary|hysterectomy|oophorectomy|fallopian|cervical)',
        'transplant': r'(transplant|graft)',
        'ent': r'(ear|nose|throat|sinus|thyroid|parathyroid|larynx)'
    }
    
    for category, pattern in patterns.items():
        if re.search(pattern, opname):
            return category
    
    # Check for some common keywords that might indicate the surgery type
    if any(x in opname for x in ['resection', 'ectomy', 'removal']):
        return 'resection'
    
    if any(x in opname for x in ['repair', 'reconstruction']):
        return 'repair'
    
    if 'biopsy' in opname:
        return 'biopsy'
    
    if 'implant' in opname:
        return 'implant'
    
    return 'other'

def clean_cases(cases_df):
    """Clean and preprocess cases data."""
    print("Cleaning cases data...")
    
    # Handle missing or invalid data
    cases_df = cases_df.dropna(subset=['caseid'])
    
    # Try to convert timestamps to datetime, if they exist
    for col in ['casestart', 'caseend']:
        if col in cases_df.columns:
            try:
                cases_df[col] = pd.to_datetime(cases_df[col], errors='coerce')
            except:
                print(f"Could not convert {col} to datetime, skipping")
    
    # Extract operation type and medical service
    if 'opname' in cases_df.columns:
        cases_df['operation_type'] = cases_df['opname'].apply(extract_operation_type)
    else:
        # If opname doesn't exist, try to extract from other fields or set as unknown
        cases_df['operation_type'] = 'unknown'
    
    # Create a complexity score based on available data
    # Use ASA score, age, and procedure type if available
    complexity_factors = []
    
    # Age factor (older patients = higher complexity)
    if 'age' in cases_df.columns:
        age_normalized = cases_df['age'].fillna(50) / 100  # Normalize to 0-1 scale
        complexity_factors.append(age_normalized)
    
    # ASA score factor
    if 'asa' in cases_df.columns:
        asa_normalized = (pd.to_numeric(cases_df['asa'], errors='coerce').fillna(2) - 1) / 4  # Normalize ASA 1-5 to 0-1
        complexity_factors.append(asa_normalized)
    
    # Emergency operation factor
    if 'emop' in cases_df.columns:
        emop_factor = cases_df['emop'].fillna(0).astype(float) / 1  # 0 or 1
        complexity_factors.append(emop_factor)
    
    # If we have some factors, compute average
    if complexity_factors:
        # Take the average of available factors
        cases_df['complexity_score'] = pd.concat(complexity_factors, axis=1).mean(axis=1) * 100
    else:
        # If no factors available, assign random scores for demonstration
        cases_df['complexity_score'] = np.random.randint(1, 100, size=len(cases_df))
    
    return cases_df

def clean_labs(labs_df):
    """Clean and preprocess lab results data."""
    print("Cleaning labs data...")
    
    # Handle missing values
    labs_df = labs_df.dropna(subset=['caseid'])
    
    # Convert result to numeric where possible
    try:
        labs_df['result_numeric'] = pd.to_numeric(labs_df['result'], errors='coerce')
    except:
        labs_df['result_numeric'] = np.nan
    
    # Try to convert timestamp to datetime
    if 'dt' in labs_df.columns:
        try:
            labs_df['dt'] = pd.to_datetime(labs_df['dt'], errors='coerce')
        except:
            print("Could not convert dt to datetime, skipping")
    
    # Categorize lab tests
    labs_df['test_category'] = labs_df['name'].apply(categorize_lab_test)
    
    return labs_df

def categorize_lab_test(test_name):
    """Categorize lab test based on name."""
    if pd.isna(test_name):
        return "Unknown"
    
    test_name = str(test_name).lower()
    
    # Common lab test categories
    categories = {
        'blood_count': ['cbc', 'hemoglobin', 'hematocrit', 'platelet', 'wbc', 'rbc'],
        'chemistry': ['sodium', 'potassium', 'chloride', 'bicarbonate', 'bun', 'creatinine', 'glucose'],
        'liver': ['ast', 'alt', 'bilirubin', 'albumin', 'protein'],
        'cardiac': ['troponin', 'ck', 'bnp', 'mb'],
        'coagulation': ['pt', 'ptt', 'inr'],
        'arterial_blood_gas': ['abg', 'ph', 'pco2', 'po2', 'hco3'],
        'inflammatory': ['crp', 'esr', 'procalcitonin']
    }
    
    for category, keywords in categories.items():
        if any(keyword in test_name for keyword in keywords):
            return category
    
    return 'other'

def clean_tracks(tracks_df):
    """Clean and preprocess tracking data."""
    print("Cleaning tracks data...")
    
    # Handle missing values
    tracks_df = tracks_df.dropna(subset=['caseid'])
    
    # Categorize tracks
    if 'tname' in tracks_df.columns:
        tracks_df['track_category'] = tracks_df['tname'].apply(categorize_track)
    else:
        tracks_df['track_category'] = 'unknown'
    
    return tracks_df

def categorize_track(track_name):
    """Categorize track based on name."""
    if pd.isna(track_name):
        return "Unknown"
    
    track_name = str(track_name).lower()
    
    # Define categories for different biosignals
    categories = {
        'cardiac': ['heart', 'ecg', 'ekg', 'pulse', 'bp', 'blood pressure', 'cardiac', 'hr'],
        'respiratory': ['resp', 'breathing', 'oxygen', 'ventilation', 'etco2', 'co2', 'o2'],
        'neurological': ['eeg', 'brain', 'neural', 'consciousness', 'neuro'],
        'temperature': ['temp', 'thermoregulation'],
        'fluid': ['fluid', 'balance', 'urine', 'output', 'intake']
    }
    
    for category, keywords in categories.items():
        if any(keyword in track_name for keyword in keywords):
            return category
    
    return 'other'

def create_case_hierarchy(cases_df):
    """Create a hierarchical structure for case selection."""
    print("Creating case hierarchy...")
    
    # Create hierarchy based on operation type and complexity
    hierarchy = {}
    
    # Get unique operation types
    operation_types = cases_df['operation_type'].unique()
    
    for op_type in operation_types:
        # Filter cases by operation type
        cases_subset = cases_df[cases_df['operation_type'] == op_type]
        
        # Skip if too few cases
        if len(cases_subset) < 3:
            continue
        
        # Divide into complexity levels
        try:
            # Try using qcut for equal-sized bins
            complexity_bins = pd.qcut(cases_subset['complexity_score'], 
                                    q=3, 
                                    labels=['Low', 'Medium', 'High'])
        except ValueError:
            # If qcut fails, use simple fixed bins
            cases_subset['complexity_level'] = 'Medium'
            cases_subset.loc[cases_subset['complexity_score'] <= 33, 'complexity_level'] = 'Low'
            cases_subset.loc[cases_subset['complexity_score'] >= 66, 'complexity_level'] = 'High'
            complexity_bins = cases_subset['complexity_level']
        
        # Create hierarchical structure with case counts
        low_cases = cases_subset[complexity_bins == 'Low']['caseid'].astype(str).tolist()
        med_cases = cases_subset[complexity_bins == 'Medium']['caseid'].astype(str).tolist()
        high_cases = cases_subset[complexity_bins == 'High']['caseid'].astype(str).tolist()
        
        # Only include non-empty categories
        if low_cases or med_cases or high_cases:
            hierarchy[op_type] = {}
            
            if low_cases:
                hierarchy[op_type]['Low'] = low_cases
            if med_cases:
                hierarchy[op_type]['Medium'] = med_cases
            if high_cases:
                hierarchy[op_type]['High'] = high_cases
    
    # Add a "mixed" category with a random sample of cases
    all_cases = cases_df['caseid'].astype(str).sample(min(150, len(cases_df))).tolist()
    tercile = len(all_cases) // 3
    
    hierarchy['mixed'] = {
        'Low': all_cases[:tercile],
        'Medium': all_cases[tercile:2*tercile],
        'High': all_cases[2*tercile:]
    }
    
    return hierarchy

def main():
    """Main preprocessing pipeline."""
    # Create processed directory if it doesn't exist
    processed_dir = os.path.join(os.path.dirname(__file__), 'processed')
    Path(processed_dir).mkdir(exist_ok=True)
    
    # Load raw data
    print("Loading raw data...")
    cases_df, labs_df, tracks_df = load_raw_data()
    
    # Process each dataset
    print("Processing cases...")
    cases_processed = clean_cases(cases_df)
    
    print("Processing labs...")
    labs_processed = clean_labs(labs_df)
    
    print("Processing tracks...")
    tracks_processed = clean_tracks(tracks_df)
    
    # Create case hierarchy
    hierarchy = create_case_hierarchy(cases_processed)
    
    # Save processed data
    print("Saving processed data...")
    cases_processed.to_csv(os.path.join(processed_dir, 'cases_processed.txt'), index=False)
    labs_processed.to_csv(os.path.join(processed_dir, 'labs_processed.txt'), index=False)
    tracks_processed.to_csv(os.path.join(processed_dir, 'tracks_processed.txt'), index=False)
    
    # Save hierarchy to JSON
    with open(os.path.join(processed_dir, 'case_hierarchy.json'), 'w') as f:
        json.dump(hierarchy, f)
    
    print("Data preprocessing complete!")

if __name__ == "__main__":
    main() 