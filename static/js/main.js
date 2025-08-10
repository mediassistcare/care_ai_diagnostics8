document.addEventListener('DOMContentLoaded', function() {
    // Make these variables globally accessible
    window.currentStep = 0;  // Start from step 0
    window.totalSteps = 6;  // Final step index (0..6) UPDATED for Patient History Followup
    window.selectedSymptoms = new Set();    // Add missing global for region selection
    window.selectedRegions = window.selectedRegions || new Set();
    window.userData = {
        caseType: '',  // Add case type to user data
        demographics: {},
        history: {},
        symptoms: [],
        detailed_symptoms: {},
        regions: []
    };

    // Create aliases for easier access within this scope
    let currentStep = window.currentStep;
    const totalSteps = window.totalSteps;
    const selectedSymptoms = window.selectedSymptoms;
    // Alias for regions selection
    const selectedRegions = window.selectedRegions;
    let userData = window.userData;
    // Alias for legacy code that references patientData
    window.patientData = window.userData;

    // Initialize the interface
    const init = () => {
        showStep(0);  // Start from step 0
        setupCardSelection();
        setupNavigation();
        setupSymptomSearch();
        setupPatientForm();  // Add patient form setup
        // Wire region selection if the UI exists
        if (document.querySelector('.region-checkbox')) {
            setupRegionSelection();
        }
        // Restart assessment link
        const restartLink = document.getElementById('restartAssessment');
        if (restartLink) {
            restartLink.addEventListener('click', (e) => {
                e.preventDefault();
                // Reloading hits '/' which resets conversation state server-side
                window.location.href = '/';
            });
        }
    };

    // Navigation
    const updateSidebarNavigation = () => {
        document.querySelectorAll('.nav-item').forEach((item, index) => {
            item.classList.remove('active');
            if (index === currentStep) {  // Fixed: use index directly instead of index + 1
                item.classList.add('active');
            }
        });
    };

    const showStep = (step) => {
        // Hide all step content
        document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
        
        // Show current step
        const currentStepElement = document.getElementById(`step-${step}`);
        if (currentStepElement) {
            currentStepElement.classList.add('active');
        }
        
        // Update navigation buttons
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        
        prevBtn.style.display = step === 0 ? 'none' : 'block';  // Hide previous on step 0
        nextBtn.style.display = step === 6 ? 'none' : 'block';  // Hide next on final step (6)
        
        // Update navigation text
        if (nextBtn) {
            nextBtn.textContent = step === 5 ? 'Get Results' : 'Continue';
        }
        
        updateSidebarNavigation();
        
        // Load content for specific steps
        if (step === 2) {
            // Setup BMI auto-calculation when entering Clinical Vitals
            setupBMICalculation();
        }
    };

    // Card-based selection for both case type and gender
    const setupCardSelection = () => {
        // Handle case type selection in step 0
        const step0Cards = document.querySelectorAll('#step-0 .selection-card');
        step0Cards.forEach(card => {
            card.addEventListener('click', () => {
                // Remove selection from all step 0 cards
                step0Cards.forEach(c => c.classList.remove('selected'));
                // Add selection to clicked card
                card.classList.add('selected');
                
                // Store the selected case type
                const value = card.getAttribute('data-value');
                userData.caseType = value;
            });
        });

        // Handle gender selection in step 1 (if card UI is used)
        const step1Cards = document.querySelectorAll('#step-1 .selection-card');
        step1Cards.forEach(card => {
            card.addEventListener('click', () => {
                // Remove selection from all step 1 cards
                step1Cards.forEach(c => c.classList.remove('selected'));
                // Add selection to clicked card
                card.classList.add('selected');
                
                // Store the selected gender
                const value = card.getAttribute('data-value');
                userData.demographics.gender = value;
            });
        });
    };

    // NEW: Patient form wiring (gender/age capture and medications list toggle)
    const setupPatientForm = () => {
        // Gender radios -> store selection and show/hide female questions
        document.querySelectorAll('input[name="gender"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                userData.demographics = userData.demographics || {};
                userData.demographics.gender = e.target.value;
                
                // Show/hide female-specific questions
                const femaleQuestions = document.getElementById('femaleQuestions');
                if (femaleQuestions) {
                    femaleQuestions.style.display = e.target.value === 'female' ? 'block' : 'none';
                }
            });
        });

        // Pregnancy status handling
        document.querySelectorAll('input[name="pregnant"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const pregnancyMonthSection = document.getElementById('pregnancyMonthSection');
                if (pregnancyMonthSection) {
                    pregnancyMonthSection.style.display = e.target.value === 'yes' ? 'block' : 'none';
                }
            });
        });

        // EMR status handling
        document.querySelectorAll('input[name="emrStatus"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const existingEmrSection = document.getElementById('existingEmrSection');
                const newEmrSection = document.getElementById('newEmrSection');
                
                if (e.target.value === 'existing') {
                    if (existingEmrSection) existingEmrSection.style.display = 'block';
                    if (newEmrSection) newEmrSection.style.display = 'none';
                } else if (e.target.value === 'none') {
                    if (existingEmrSection) existingEmrSection.style.display = 'none';
                    if (newEmrSection) newEmrSection.style.display = 'block';
                } else {
                    if (existingEmrSection) existingEmrSection.style.display = 'none';
                    if (newEmrSection) newEmrSection.style.display = 'none';
                }
            });
        });

        // ECG availability handling
        document.querySelectorAll('input[name="ecgAvailable"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const ecgDetailsSection = document.getElementById('ecgDetailsSection');
                const ecgUploadSection = document.getElementById('ecgUploadSection');
                
                if (e.target.value === 'yes') {
                    if (ecgDetailsSection) ecgDetailsSection.style.display = 'block';
                    if (ecgUploadSection) ecgUploadSection.style.display = 'block';
                } else {
                    if (ecgDetailsSection) ecgDetailsSection.style.display = 'none';
                    if (ecgUploadSection) ecgUploadSection.style.display = 'none';
                }
            });
        });

        // Family history handling - ensure only one can be selected at a time for "None"
        document.querySelectorAll('input[name="familyHistory"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                if (e.target.value === 'none' && e.target.checked) {
                    // If "None" is checked, uncheck all others
                    document.querySelectorAll('input[name="familyHistory"]').forEach(cb => {
                        if (cb.value !== 'none') cb.checked = false;
                    });
                } else if (e.target.checked && e.target.value !== 'none') {
                    // If any other option is checked, uncheck "None"
                    const noneCheckbox = document.querySelector('input[name="familyHistory"][value="none"]');
                    if (noneCheckbox) noneCheckbox.checked = false;
                }
            });
        });

        // Ethnicity radios -> store selection (converted from dropdown)
        document.querySelectorAll('input[name="ethnicity"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                userData.demographics = userData.demographics || {};
                userData.demographics.ethnicity = e.target.value;
            });
        });

        // Blood group radios -> store selection (converted from dropdown)
        document.querySelectorAll('input[name="bloodGroup"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                userData.medicalHistory = userData.medicalHistory || {};
                userData.medicalHistory.bloodGroup = e.target.value;
            });
        });

        // Age input -> store numeric age
        const ageInput = document.getElementById('patientAge');
        if (ageInput) {
            const persistAge = (val) => {
                const ageNum = parseInt(val, 10);
                if (!isNaN(ageNum)) {
                    userData.demographics = userData.demographics || {};
                    userData.demographics.age = ageNum;
                } else if (userData.demographics) {
                    delete userData.demographics.age;
                }
            };
            ageInput.addEventListener('input', (e) => persistAge(e.target.value));
            if (ageInput.value) persistAge(ageInput.value);
        }

        // Date of Birth -> automatically calculate age
        const dobInput = document.getElementById('dateOfBirth');
        if (dobInput) {
            dobInput.addEventListener('change', (e) => {
                const dob = new Date(e.target.value);
                const today = new Date();
                const age = Math.floor((today - dob) / (365.25 * 24 * 60 * 60 * 1000));
                
                const ageInput = document.getElementById('patientAge');
                if (ageInput && age >= 0 && age <= 120) {
                    ageInput.value = age;
                    userData.demographics = userData.demographics || {};
                    userData.demographics.age = age;
                    userData.demographics.dateOfBirth = e.target.value;
                }
            });
        }

        // Medications: show/hide textarea based on selection
        const medsList = document.getElementById('medicationsList');
        const toggleMeds = () => {
            const selected = document.querySelector('input[name="takingMedications"]:checked');
            if (medsList) medsList.style.display = selected && selected.value === 'yes' ? 'block' : 'none';
        };
        document.querySelectorAll('input[name="takingMedications"]').forEach(r => r.addEventListener('change', toggleMeds));
        toggleMeds();

        // File upload handling for document scans
        const setupFileUpload = (inputId, labelText) => {
            const fileInput = document.getElementById(inputId);
            if (fileInput) {
                fileInput.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        console.log(`${labelText} uploaded:`, file.name);
                        // Store file reference in userData for potential processing
                        userData.uploadedFiles = userData.uploadedFiles || {};
                        userData.uploadedFiles[inputId] = {
                            name: file.name,
                            size: file.size,
                            type: file.type,
                            uploadedAt: new Date().toISOString()
                        };
                    }
                });
            }
        };

        // Setup file uploads
        setupFileUpload('aadharScan', 'Aadhar ID');
        setupFileUpload('insuranceScan', 'Insurance Document');
        setupFileUpload('vaccineScan', 'Vaccine Certificate');
        setupFileUpload('existingEmrScan', 'Existing EMR');
        setupFileUpload('ecgScan', 'ECG Report');
        setupFileUpload('tongueThroatScan', 'Tongue & Throat Photo');
        setupFileUpload('infectionScan', 'Infection/Rash Photo');
    };

    // Navigation setup
    const setupNavigation = () => {
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        const backBtn = document.querySelector('.back-btn');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', prevStep);
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', nextStep);
        }
        
        if (backBtn) {
            backBtn.addEventListener('click', prevStep);
        }
        
        // Sidebar navigation
        document.querySelectorAll('.nav-item').forEach((item, index) => {
            item.addEventListener('click', () => {
                const targetStep = index;  // Fixed: use index directly since we start from step 0
                if (targetStep <= currentStep || canNavigateToStep(targetStep)) {
                    currentStep = targetStep;
                    showStep(currentStep);
                }
            });
        });
    };

    const canNavigateToStep = (step) => {
        // Only allow navigation to completed steps or the next immediate step
        return step <= currentStep + 1;
    };

    const nextStep = () => {
        if (validateCurrentStep()) {
            if (window.currentStep < window.totalSteps) {
                window.currentStep++;
                currentStep = window.currentStep; // Sync local variable
                showStep(window.currentStep);
                
                // Handle specific step transitions
                if (window.currentStep === 4) {
                    // Always call getFollowUpQuestions when entering interview step
                    console.log('Entering interview step, calling getFollowUpQuestions...');
                    getFollowUpQuestions();
                } else if (window.currentStep === 5) {
                    analyzeSymptoms();
                }
            }
        }
    };

    const prevStep = () => {
        if (window.currentStep > 0) {  // Changed from > 1 to > 0 to allow going back to step 0
            window.currentStep--;
            currentStep = window.currentStep; // Sync local variable
            showStep(window.currentStep);
        }
    };

    // Validation
    const validateCurrentStep = () => {
        switch(currentStep) {
            case 0:
                // Validate case type selection
                const selectedCaseCard = document.querySelector('#step-0 .selection-card.selected');
                if (!selectedCaseCard) {
                    alert('Please select a medical case type to continue');
                    return false;
                }
                userData.caseType = selectedCaseCard.getAttribute('data-value');
                return true;
                
            case 1:
                // Validate comprehensive patient information including gender and age
                let hasRequiredInfo = false;
                let validationErrors = [];

                // Check gender selection
                const genderChecked = document.querySelector('input[name="gender"]:checked');
                if (!genderChecked) {
                    validationErrors.push('Please select your gender');
                }

                // Check age
                const patientAge = document.getElementById('patientAge')?.value;
                if (!patientAge || isNaN(patientAge) || parseInt(patientAge) < 0 || parseInt(patientAge) > 120) {
                    validationErrors.push('Please enter a valid age (0-120 years)');
                }

                // Check if at least some additional information is provided
                const currentLocation = document.getElementById('currentLocation')?.value?.trim();
                const ethnicityChecked = document.querySelector('input[name="ethnicity"]:checked');
                
                // Check medical conditions
                const diabeticChecked = document.querySelector('input[name="diabetic"]:checked');
                const hypertensionChecked = document.querySelector('input[name="hypertension"]:checked');
                
                // At least gender and age are required, plus some additional info
                if (genderChecked && patientAge && (currentLocation || ethnicityChecked || diabeticChecked || hypertensionChecked)) {
                    hasRequiredInfo = true;
                } else if (genderChecked && patientAge) {
                    hasRequiredInfo = true; // Allow with just gender and age
                }

                // Validate EMR ID format if provided
                const emrId = document.getElementById('emrId')?.value?.trim();
                if (emrId && emrId.length < 3) {
                    validationErrors.push('EMR/EHR ID must be at least 3 characters long');
                }

                // Validate children field if provided
                const children = document.getElementById('children')?.value;
                if (children && (isNaN(children) || parseInt(children) < 0)) {
                    validationErrors.push('Number of children must be a valid number');
                }

                // Check if medications are specified when "yes" is selected
                const takingMedications = document.querySelector('input[name="takingMedications"]:checked');
                const currentMedications = document.getElementById('currentMedications')?.value?.trim();
                
                if (takingMedications && takingMedications.value === 'yes' && !currentMedications) {
                    validationErrors.push('Please list your current medications or select "No" if you are not taking any');
                }

                if (!hasRequiredInfo || validationErrors.length > 0) {
                    alert(validationErrors.join('\n'));
                    return false;
                }

                // Store all the patient form data
                collectPatientFormData();
                return true;

            case 2:
                // Clinical Vitals: collect data and validate ranges only if provided
                const vitalsErrors = [];
                const pulseRate = document.getElementById('pulseRate')?.value;
                const systolic = document.getElementById('systolic')?.value;
                const diastolic = document.getElementById('diastolic')?.value;
                const oxygenSaturation = document.getElementById('oxygenSaturation')?.value;
                const bloodSugar = document.getElementById('bloodSugar')?.value;
                const temperature = document.getElementById('temperature')?.value;
                const temperatureUnit = document.getElementById('temperatureUnit')?.value || 'F';

                if (pulseRate && (isNaN(pulseRate) || parseInt(pulseRate) < 40 || parseInt(pulseRate) > 200)) {
                    vitalsErrors.push('Pulse rate must be between 40 and 200 BPM');
                }
                if (systolic && (isNaN(systolic) || parseInt(systolic) < 70 || parseInt(systolic) > 250)) {
                    vitalsErrors.push('Systolic blood pressure must be between 70 and 250 mmHg');
                }
                if (diastolic && (isNaN(diastolic) || parseInt(diastolic) < 40 || parseInt(diastolic) > 150)) {
                    vitalsErrors.push('Diastolic blood pressure must be between 40 and 150 mmHg');
                }
                if (oxygenSaturation && (isNaN(oxygenSaturation) || parseInt(oxygenSaturation) < 70 || parseInt(oxygenSaturation) > 100)) {
                    vitalsErrors.push('Oxygen saturation must be between 70 and 100%');
                }
                if (bloodSugar && (isNaN(bloodSugar) || parseInt(bloodSugar) < 30 || parseInt(bloodSugar) > 800)) {
                    vitalsErrors.push('Random blood sugar must be between 30 and 800 mg/dL');
                }
                if (temperature) {
                    const tempVal = parseFloat(temperature);
                    if (isNaN(tempVal)) {
                        vitalsErrors.push('Temperature must be a valid number');
                    } else if (temperatureUnit === 'F' && (tempVal < 90 || tempVal > 110)) {
                        vitalsErrors.push('Temperature in Fahrenheit must be between 90 and 110°F');
                    } else if (temperatureUnit === 'C' && (tempVal < 32 || tempVal > 43)) {
                        vitalsErrors.push('Temperature in Celsius must be between 32 and 43°C');
                    }
                }

                if (vitalsErrors.length > 0) {
                    alert(vitalsErrors.join('\n'));
                    return false;
                }

                collectVitalsData();
                return true;

            case 3:
                // Patient History Followup step - generate AI summary and proceed
                generatePatientHistorySummary();
                return true;

            case 4:
                // Validate symptoms (moved from previous step 3)
                const freeTextSymptoms = document.getElementById('freeTextSymptoms').value.trim();
                if (selectedSymptoms.size === 0 && !freeTextSymptoms) {
                    alert('Please select at least one symptom or describe your symptoms in the text area');
                    return false;
                }
                // Store free text symptoms
                userData.freeTextSymptoms = freeTextSymptoms;
                return true;

            case 5:
                // Interview step - no validation needed as it's handled by follow-up questions
                return true;

            case 6:
                // Results step - no validation needed
                return true;

            default:
                return true;
        }
    };

    // Collect all patient form data
    const collectPatientFormData = () => {
        // Basic demographics: gender and age
        const genderChecked = document.querySelector('input[name="gender"]:checked');
        const ageVal = document.getElementById('patientAge')?.value;
        if (genderChecked) {
            userData.demographics = userData.demographics || {};
            userData.demographics.gender = genderChecked.value;
        }
        if (ageVal && !isNaN(parseInt(ageVal, 10))) {
            userData.demographics = userData.demographics || {};
            userData.demographics.age = parseInt(ageVal, 10);
        }

        // Demographics (additional)
        const currentLocation = document.getElementById('currentLocation')?.value?.trim();
        const ethnicityVal = document.querySelector('input[name="ethnicity"]:checked')?.value;
        
        if (currentLocation) {
            if (!userData.demographics) userData.demographics = {};
            userData.demographics.currentLocation = currentLocation;
        }
        
        if (ethnicityVal) {
            if (!userData.demographics) userData.demographics = {};
            userData.demographics.ethnicity = ethnicityVal;
        }

        // Medical conditions
        const diabeticChecked = document.querySelector('input[name="diabetic"]:checked');
        const hypertensionChecked = document.querySelector('input[name="hypertension"]:checked');
        
        if (diabeticChecked || hypertensionChecked) {
            if (!userData.medicalConditions) userData.medicalConditions = {};
            if (diabeticChecked) userData.medicalConditions.diabetic = diabeticChecked.value;
            if (hypertensionChecked) userData.medicalConditions.hypertension = hypertensionChecked.value;
        }

        // Medical history
        const vaccineHistory = document.getElementById('vaccineHistory')?.value?.trim();
        const bloodGroupVal = document.querySelector('input[name="bloodGroup"]:checked')?.value;
        const familyHistory = document.getElementById('familyHistory')?.value?.trim();
        
        if (vaccineHistory || bloodGroupVal || familyHistory) {
            if (!userData.medicalHistory) userData.medicalHistory = {};
            if (vaccineHistory) userData.medicalHistory.vaccineHistory = vaccineHistory;
            if (bloodGroupVal) userData.medicalHistory.bloodGroup = bloodGroupVal;
            if (familyHistory) userData.medicalHistory.familyHistory = familyHistory;
        }

        // Travel & lifestyle
        const travelHistory = document.getElementById('travelHistory')?.value?.trim();
        const occupation = document.getElementById('occupation')?.value?.trim();
        const children = document.getElementById('children')?.value;
        
        if (travelHistory || occupation || children) {
            if (!userData.lifestyle) userData.lifestyle = {};
            if (travelHistory) userData.lifestyle.travelHistory = travelHistory;
            if (occupation) userData.lifestyle.occupation = occupation;
            if (children) userData.lifestyle.children = children;
        }

        // Pregnancy status (if female)
        const pregnantChecked = document.querySelector('input[name="pregnant"]:checked');
        if (pregnantChecked) {
            if (!userData.lifestyle) userData.lifestyle = {};
            userData.lifestyle.pregnant = pregnantChecked.value;
        }

        // Medical records & medications
        const emrId = document.getElementById('emrId')?.value?.trim();
        const takingMedicationsChecked = document.querySelector('input[name="takingMedications"]:checked');
        const currentMedications = document.getElementById('currentMedications')?.value?.trim();
        
        if (emrId || takingMedicationsChecked || currentMedications) {
            if (!userData.medicalRecords) userData.medicalRecords = {};
            if (emrId) userData.medicalRecords.emrId = emrId;
            if (takingMedicationsChecked) userData.medicalRecords.takingMedications = takingMedicationsChecked.value;
            if (currentMedications) userData.medicalRecords.currentMedications = currentMedications;
        }
    };

    // NEW: Collect Clinical Vitals data and BMI utilities
    const collectVitalsData = () => {
        if (!userData.vitals) userData.vitals = {};

        // Essential Vital Signs
        const pulseRate = document.getElementById('pulseRate')?.value;
        const systolic = document.getElementById('systolic')?.value;
        const diastolic = document.getElementById('diastolic')?.value;
        const oxygenSaturation = document.getElementById('oxygenSaturation')?.value;
        const bloodSugar = document.getElementById('bloodSugar')?.value;
        const temperature = document.getElementById('temperature')?.value;
        const temperatureUnit = document.getElementById('temperatureUnit')?.value || 'F';
        const respiratoryRate = document.getElementById('respiratoryRate')?.value;

        if (pulseRate) userData.vitals.pulseRate = parseInt(pulseRate, 10);
        if (systolic) userData.vitals.systolic = parseInt(systolic, 10);
        if (diastolic) userData.vitals.diastolic = parseInt(diastolic, 10);
        if (oxygenSaturation) userData.vitals.oxygenSaturation = parseInt(oxygenSaturation, 10);
        if (bloodSugar) userData.vitals.bloodSugar = parseInt(bloodSugar, 10);
        if (respiratoryRate) userData.vitals.respiratoryRate = parseInt(respiratoryRate, 10);
        if (temperature) {
            userData.vitals.temperature = parseFloat(temperature);
            userData.vitals.temperatureUnit = temperatureUnit;
        }

        // Heart monitoring
        const heartRhythm = document.querySelector('input[name="heartRhythm"]:checked')?.value;
        const heartMurmur = document.getElementById('heartMurmur')?.value?.trim();
        if (heartRhythm) userData.vitals.heartRhythm = heartRhythm;
        if (heartMurmur) userData.vitals.heartLungSounds = heartMurmur;

        // ECG Information
        const ecgAvailable = document.querySelector('input[name="ecgAvailable"]:checked')?.value;
        const ecgFindings = document.getElementById('ecgFindings')?.value?.trim();
        if (ecgAvailable) userData.vitals.ecgAvailable = ecgAvailable;
        if (ecgFindings) userData.vitals.ecgFindings = ecgFindings;

        // Respiratory Function
        const peakFlow = document.getElementById('peakFlow')?.value;
        const fev1 = document.getElementById('fev1')?.value;
        const respiratoryNotes = document.getElementById('respiratoryNotes')?.value?.trim();
        if (peakFlow) userData.vitals.peakExpiratoryFlow = parseInt(peakFlow, 10);
        if (fev1) userData.vitals.forcedExpiratoryVolume = parseFloat(fev1);
        if (respiratoryNotes) userData.vitals.respiratoryObservations = respiratoryNotes;

        // Photography & Visual Examination
        const tongueThroatComments = document.getElementById('tongueThroatComments')?.value?.trim();
        const infectionComments = document.getElementById('infectionComments')?.value?.trim();
        if (tongueThroatComments) userData.vitals.tongueThroatFindings = tongueThroatComments;
        if (infectionComments) userData.vitals.infectionRashFindings = infectionComments;

        // Physical measurements
        const weight = document.getElementById('weight')?.value;
        const weightUnit = document.getElementById('weightUnit')?.value || 'kg';
        const height = document.getElementById('height')?.value;
        const heightUnit = document.getElementById('heightUnit')?.value || 'cm';
        const waistCircumference = document.getElementById('waistCircumference')?.value;

        if (weight) {
            userData.vitals.weight = parseFloat(weight);
            userData.vitals.weightUnit = weightUnit;
        }
        if (height) {
            userData.vitals.height = parseFloat(height);
            userData.vitals.heightUnit = heightUnit;
        }
        if (waistCircumference) userData.vitals.waistCircumference = parseInt(waistCircumference, 10);

        // Body composition
        const muscleMass = document.getElementById('muscleMass')?.value;
        const fatMass = document.getElementById('fatMass')?.value;
        const bodyWater = document.getElementById('bodyWater')?.value;
        if (muscleMass) userData.vitals.muscleMass = parseFloat(muscleMass);
        if (fatMass) userData.vitals.fatMass = parseFloat(fatMass);
        if (bodyWater) userData.vitals.bodyWater = parseFloat(bodyWater);

        // Pain assessment
        const painScale = document.querySelector('input[name="painScale"]:checked')?.value;
        if (painScale) userData.vitals.painScale = parseInt(painScale, 10);

        // Notes
        const vitalsNotes = document.getElementById('vitalsNotes')?.value?.trim();
        if (vitalsNotes) userData.vitals.notes = vitalsNotes;

        // Calculate BMI if possible
        calculateAndDisplayBMI();
    };

    const calculateAndDisplayBMI = () => {
        const weightInput = document.getElementById('weight');
        const heightInput = document.getElementById('height');
        const bmiDisplay = document.getElementById('bmi');
        const weightUnit = document.getElementById('weightUnit')?.value || 'kg';
        const heightUnit = document.getElementById('heightUnit')?.value || 'cm';
        if (!weightInput || !heightInput || !bmiDisplay) return;

        const weight = parseFloat(weightInput.value);
        const height = parseFloat(heightInput.value);
        if (isNaN(weight) || isNaN(height) || weight <= 0 || height <= 0) {
            bmiDisplay.value = '';
            return;
        }

        // Convert weight to kg
        let weightKg = weightUnit === 'lbs' ? weight * 0.453592 : weight;
        // Convert height to meters
        let heightM;
        if (heightUnit === 'cm') heightM = height / 100;
        else if (heightUnit === 'ft') heightM = height * 0.3048;
        else if (heightUnit === 'in') heightM = height * 0.0254;
        else heightM = height; // assume meters

        const bmi = weightKg / (heightM * heightM);
        const bmiText = bmi.toFixed(1);
        let category = '';
        if (bmi < 18.5) category = ' (Underweight)';
        else if (bmi < 25) category = ' (Normal)';
        else if (bmi < 30) category = ' (Overweight)';
        else category = ' (Obese)';

        bmiDisplay.value = bmiText + category;
        if (!userData.vitals) userData.vitals = {};
        userData.vitals.bmi = parseFloat(bmiText);
        userData.vitals.bmiCategory = category.replace(/[()]/g, '').trim();
    };

    const setupBMICalculation = () => {
        const weightInput = document.getElementById('weight');
        const heightInput = document.getElementById('height');
        const weightUnit = document.getElementById('weightUnit');
        const heightUnit = document.getElementById('heightUnit');
        if (weightInput) weightInput.addEventListener('input', calculateAndDisplayBMI);
        if (heightInput) heightInput.addEventListener('input', calculateAndDisplayBMI);
        if (weightUnit) weightUnit.addEventListener('change', calculateAndDisplayBMI);
        if (heightUnit) heightUnit.addEventListener('change', calculateAndDisplayBMI);
    };

    // Symptom search functionality
    const setupSymptomSearch = () => {
        const symptomInput = document.getElementById('symptomInput');
        const symptomSuggestions = document.getElementById('symptomSuggestions');
        const analyzeBtn = document.getElementById('analyzeLabelsBtn');
        let typingTimer;
        let lastQuery = '';
        // Use a shared window-level cache so other functions can read/write
        const cache = window.symptomSuggestionsCache || (window.symptomSuggestionsCache = new Map());

        if (!symptomInput) return;

        // Add analyze button event listener
        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', () => {
                handleAnalyzeSymptoms();
            });
        }

        symptomInput.addEventListener('input', () => {
            const query = symptomInput.value.trim().toLowerCase();
            
            if (query.length < 2) {
                symptomSuggestions.style.display = 'none';
                return;
            }

            if (cache.has(query)) {
                displaySuggestions(cache.get(query));
                return;
            }

            if (query !== lastQuery) {
                symptomSuggestions.innerHTML = '<div class="suggestion-loading">Finding matching symptoms...</div>';
                symptomSuggestions.style.display = 'block';
            }

            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => {
                if (query !== lastQuery) {
                    lastQuery = query;
                    getSymptomSuggestions(query);
                }
            }, 300);
        });

        // Close suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!symptomInput.contains(e.target) && !symptomSuggestions.contains(e.target)) {
                symptomSuggestions.style.display = 'none';
            }
        });
    };

    const handleAnalyzeSymptoms = async () => {
        const symptoms = Array.from(selectedSymptoms);
        const freeText = document.getElementById('freeTextSymptoms')?.value || '';
        const analyzeBtn = document.getElementById('analyzeLabelsBtn');
        
        // Validate that user has entered some symptoms
        if (symptoms.length === 0 && !freeText.trim()) {
            alert('Please enter some symptoms before analyzing.');
            return;
        }
        
        // Disable button and show loading state
        if (analyzeBtn) {
            analyzeBtn.disabled = true;
            analyzeBtn.innerHTML = '🔬 Analyzing...';
        }
        
        try {
            // Call the existing label extraction function
            await extractAndDisplayLabels();
        } catch (error) {
            console.error('Error analyzing symptoms:', error);
            alert('Error analyzing symptoms. Please try again.');
        } finally {
            // Re-enable button
            if (analyzeBtn) {
                analyzeBtn.disabled = false;
                analyzeBtn.innerHTML = '🔬 Analyze My Symptoms';
            }
        }
    };

    const getSymptomSuggestions = async (input) => {
        try {
            const response = await fetch('/get_symptoms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ input })
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status} ${response.statusText}`);
            }

            // Check if response is JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Non-JSON response from symptom suggestions:', text);
                throw new Error('Server returned HTML instead of JSON');
            }

            const suggestions = await response.json();
            // Store in shared cache for future keystrokes
            if (window.symptomSuggestionsCache && typeof input === 'string') {
                window.symptomSuggestionsCache.set(input.toLowerCase(), suggestions);
            }
            displaySuggestions(suggestions);
        } catch (error) {
            console.error('Error getting suggestions:', error);
            const symptomSuggestions = document.getElementById('symptomSuggestions');
            symptomSuggestions.innerHTML = `
                <div class="suggestion-error">
                    Unable to load suggestions: ${error.message}
                    <br><button onclick="checkServerStatus()" class="btn btn-sm btn-secondary mt-2">Check Server Status</button>
                </div>
            `;
        }
    };

    const displaySuggestions = (suggestions) => {
        const symptomSuggestions = document.getElementById('symptomSuggestions');
        
        if (!suggestions || suggestions.length === 0) {
            symptomSuggestions.innerHTML = '<div class="suggestion-empty">No matching symptoms found</div>';
            symptomSuggestions.style.display = 'block';
            return;
        }

        symptomSuggestions.innerHTML = '';
        suggestions.forEach(symptom => {
            if (!selectedSymptoms.has(symptom)) {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.textContent = symptom;
                div.onclick = () => addSymptom(symptom);
                symptomSuggestions.appendChild(div);
            }
        });
        
        symptomSuggestions.style.display = 'block';
    };

    const addSymptom = (symptom) => {
        selectedSymptoms.add(symptom);
        updateSelectedSymptomsWithLabels(); // Use enhanced function
        document.getElementById('symptomInput').value = '';
        document.getElementById('symptomSuggestions').style.display = 'none';
    };

    const updateSelectedSymptoms = () => {
        const container = document.getElementById('selectedSymptoms');
        container.innerHTML = '';
        selectedSymptoms.forEach(symptom => {
            const tag = document.createElement('span');
            tag.className = 'symptom-tag';
            tag.innerHTML = `${symptom} <span class="remove" onclick="removeSymptom('${symptom}')">&times;</span>`;
            container.appendChild(tag);
        });
        userData.symptoms = Array.from(selectedSymptoms);
    };

    window.removeSymptom = (symptom) => {
        selectedSymptoms.delete(symptom);
        updateSelectedSymptomsWithLabels(); // Use enhanced function
    };

    // Add event listener for free text symptoms to trigger label extraction
    const freeTextInput = document.getElementById('freeTextSymptoms');
    if (freeTextInput) {
        freeTextInput.addEventListener('input', () => {
            extractAndDisplayLabels();
        });
    }

    // Follow-up questions
    const getFollowUpQuestions = async () => {
        try {
            // Show loading indicator
            showQuestionLoading();
            
            console.log('DEBUG: Sending userData to backend:', userData);
            
            const response = await fetch('/submit_symptoms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });
            
            // Check if response is ok
            if (!response.ok) {
                throw new Error(`Server error: ${response.status} ${response.statusText}`);
            }
            
            // Check if response is JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Non-JSON response:', text);
                throw new Error('Server returned HTML instead of JSON. Please check if the Flask server is running properly.');
            }
            
            const data = await response.json();
            console.log('DEBUG: Received response from backend:', data);
            
            // Hide loading indicator
            hideQuestionLoading();
            
            if (data.completed) {
                currentStep++;
                showStep(currentStep);
                analyzeSymptoms();
            } else if (data.question_type === 'structured_form' && data.structured_questions) {
                console.log('DEBUG: Displaying structured questions:', data.structured_questions);
                displayStructuredQuestions(data.structured_questions);
            } else if (data.question) {
                displayFollowUpQuestion(data.question);
                updateInterviewProgress();
            } else {
                console.log('DEBUG: No valid response, using fallback questions');
                // Fallback: Display default structured questions if backend doesn't respond properly
                displayFallbackStructuredQuestions();
            }
        } catch (error) {
            console.error('Error getting follow-up questions:', error);
            hideQuestionLoading();
            
            // Instead of showing error, show fallback structured questions
            console.log('DEBUG: Error occurred, using fallback questions');
            displayFallbackStructuredQuestions();
        }
    };

    // Fallback function to display structured questions when backend fails
    const displayFallbackStructuredQuestions = () => {
        const fallbackQuestions = [
            {"symptom": "Fever is continuous (no breaks)", "category": "general", "notes_hint": "e.g., constant vs up/down"},
            {"symptom": "Fever spikes at certain times daily", "category": "general", "notes_hint": "Mention time of spikes"},
            {"symptom": "Chills or shivering present", "category": "general", "notes_hint": ""},
            {"symptom": "Vomiting even without eating", "category": "gastrointestinal", "notes_hint": ""},
            {"symptom": "Vomiting only after food", "category": "gastrointestinal", "notes_hint": ""},
            {"symptom": "Stool watery", "category": "gastrointestinal", "notes_hint": ""},
            {"symptom": "Stool with mucus", "category": "gastrointestinal", "notes_hint": ""},
            {"symptom": "Stool with blood", "category": "gastrointestinal", "notes_hint": ""},
            {"symptom": "Abdominal pain constant", "category": "gastrointestinal", "notes_hint": ""},
            {"symptom": "Abdominal pain comes in waves (cramps)", "category": "gastrointestinal", "notes_hint": ""},
            {"symptom": "Pain spreads to back/shoulder", "category": "pain", "notes_hint": ""},
            {"symptom": "Rash on skin", "category": "dermatological", "notes_hint": ""},
            {"symptom": "Yellowing of eyes/skin", "category": "general", "notes_hint": ""},
            {"symptom": "Severe headache", "category": "neurological", "notes_hint": ""},
            {"symptom": "Joint or muscle pain", "category": "musculoskeletal", "notes_hint": ""},
            {"symptom": "Recent outside food / street food", "category": "risk_factors", "notes_hint": "Give date/place"},
            {"symptom": "Recent travel", "category": "risk_factors", "notes_hint": "Where/when"},
            {"symptom": "Contact with someone sick", "category": "risk_factors", "notes_hint": "Who/when"}
        ];
        
        console.log('DEBUG: Displaying fallback structured questions');
        displayStructuredQuestions(fallbackQuestions);
    };

    // Analysis
    const analyzeSymptoms = async () => {
        try {
            // Show loading indicator
            showResultsLoading();
            
            const response = await fetch('/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status} ${response.statusText}`);
            }
            
            // Check if response is JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Non-JSON response from analysis:', text);
                throw new Error('Server returned HTML instead of JSON');
            }
            
            const analysis = await response.json();
            
            // Hide loading indicator
            hideResultsLoading();
            
            displayAnalysis(analysis);
        } catch (error) {
            console.error('Error analyzing symptoms:', error);
            hideResultsLoading();
            
            const container = document.getElementById('analysisResults');
            if (container) {
                container.innerHTML = `
                    <div class="error-message">
                        <h4>Unable to Analyze Symptoms</h4>
                        <p>Error: ${error.message}</p>
                        <div class="error-actions">
                            <button class="btn btn-primary" onclick="analyzeSymptoms()">Try Again</button>
                            <button class="btn btn-secondary" onclick="checkServerStatus()">Check Server Status</button>
                        </div>
                    </div>
                `;
            }
        }
    };

    // Add server status check function
    window.checkServerStatus = async () => {
        try {
            const response = await fetch('/', { method: 'HEAD' });
            if (response.ok) {
                alert('✅ Server is running. The issue might be with the API endpoints.');
            } else {
                alert(`❌ Server responded with status: ${response.status}`);
            }
        } catch (error) {
            alert('❌ Cannot connect to server. Please make sure the Flask app is running on the correct port.');
            console.error('Server check failed:', error);
        }
    };

    // Add the complete displayAnalysis function with all medical components
    const displayAnalysis = (analysis) => {
        const container = document.getElementById('analysisResults');
        if (!container) return;
        
        container.innerHTML = '';

        // Create main analysis container
        const analysisContainer = document.createElement('div');
        analysisContainer.className = 'analysis-container';

        // Display Summary of Information Gathered
        const summarySection = document.createElement('div');
        summarySection.className = 'summary-section';
        
        const summaryHeader = document.createElement('h3');
        summaryHeader.textContent = 'Summary of Information Gathered';
        summaryHeader.className = 'analysis-section-header';
        summarySection.appendChild(summaryHeader);

        // Patient Demographics - Enhanced with all collected data and insights
        if (window.userData.demographics || window.userData.medicalConditions || window.userData.medicalHistory || window.userData.lifestyle || window.userData.medicalRecords) {
            const patientInfoDiv = document.createElement('div');
            patientInfoDiv.className = 'summary-item';
            
            const patientInfoTitle = document.createElement('h4');
            patientInfoTitle.textContent = 'Patient Information';
            patientInfoTitle.className = 'summary-item-title';
            
            const patientInfoContent = document.createElement('div');
            patientInfoContent.className = 'summary-content';
            
            let patientInfoHtml = '';
            
            // Basic Demographics with insights
            if (window.userData.demographics) {
                patientInfoHtml += '<div class="info-subsection"><h5>Basic Demographics</h5>';
                if (window.userData.demographics.gender) patientInfoHtml += `<p><strong>Gender:</strong> ${window.userData.demographics.gender.charAt(0).toUpperCase() + window.userData.demographics.gender.slice(1)}</p>`;
                if (window.userData.demographics.age) {
                    const age = window.userData.demographics.age;
                    let ageInsight = '';
                    if (age < 18) ageInsight = ' <em>(Pediatric patient - requires specialized considerations)</em>';
                    else if (age > 65) ageInsight = ' <em>(Geriatric patient - higher risk for complications, polypharmacy concerns)</em>';
                    patientInfoHtml += `<p><strong>Age:</strong> ${age} years${ageInsight}</p>`;
                }
                if (window.userData.demographics.ethnicity) patientInfoHtml += `<p><strong>Ethnicity:</strong> ${window.userData.demographics.ethnicity.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>`;
                if (window.userData.demographics.currentLocation) patientInfoHtml += `<p><strong>Current Location:</strong> ${window.userData.demographics.currentLocation}</p>`;
                patientInfoHtml += '</div>';
            }
            
            // Medical Conditions with insights
            if (window.userData.medicalConditions || window.userData.medicalHistory) {
                patientInfoHtml += '<div class="info-subsection"><h5>Medical History & Conditions</h5>';
                if (window.userData.medicalConditions) {
                    if (window.userData.medicalConditions.diabetic && window.userData.medicalConditions.diabetic !== 'no') {
                        const diabeticInsight = window.userData.medicalConditions.diabetic === 'yes' ? 
                            ' <em>(⚠️ Increases infection risk, affects wound healing, may complicate treatment)</em>' : 
                            ' <em>(Unknown status requires investigation)</em>';
                        patientInfoHtml += `<p><strong>Diabetes:</strong> ${window.userData.medicalConditions.diabetic}${diabeticInsight}</p>`;
                    }
                    if (window.userData.medicalConditions.hypertension && window.userData.medicalConditions.hypertension !== 'no') {
                        const htnInsight = window.userData.medicalConditions.hypertension === 'yes' ? 
                            ' <em>(⚠️ Cardiovascular risk factor, may affect anesthesia/surgery planning)</em>' : 
                            ' <em>(Unknown status requires investigation)</em>';
                        patientInfoHtml += `<p><strong>Hypertension:</strong> ${window.userData.medicalConditions.hypertension}${htnInsight}</p>`;
                    }
                }
                if (window.userData.medicalHistory) {
                    if (window.userData.medicalHistory.bloodGroup && window.userData.medicalHistory.bloodGroup !== 'unknown') {
                        patientInfoHtml += `<p><strong>Blood Group:</strong> ${window.userData.medicalHistory.bloodGroup} <em>(Important for emergency transfusions)</em></p>`;
                    }
                    if (window.userData.medicalHistory.familyHistory) {
                        patientInfoHtml += `<p><strong>Family History:</strong> ${window.userData.medicalHistory.familyHistory} <em>(⚠️ Genetic predisposition factors to consider)</em></p>`;
                    }
                    if (window.userData.medicalHistory.vaccineHistory) {
                        patientInfoHtml += `<p><strong>Vaccination History:</strong> ${window.userData.medicalHistory.vaccineHistory}</p>`;
                    }
                }
                
                // Medications with insights
                if (window.userData.medicalRecords) {
                    if (window.userData.medicalRecords.takingMedications === 'yes' && window.userData.medicalRecords.currentMedications) {
                        patientInfoHtml += `<p><strong>Current Medications:</strong> ${window.userData.medicalRecords.currentMedications} <em>(⚠️ Drug interactions and contraindications must be evaluated)</em></p>`;
                    }
                    if (window.userData.medicalRecords.emrId) {
                        patientInfoHtml += `<p><strong>EMR/EHR ID:</strong> ${window.userData.medicalRecords.emrId} <em>(Previous medical records available for review)</em></p>`;
                    }
                }
                
                // Lifestyle factors with insights
                if (window.userData.lifestyle) {
                    if (window.userData.lifestyle.travelHistory) {
                        patientInfoHtml += `<p><strong>Recent Travel:</strong> ${window.userData.lifestyle.travelHistory} <em>(⚠️ Consider endemic diseases and travel-related infections)</em></p>`;
                    }
                    if (window.userData.lifestyle.occupation) {
                        patientInfoHtml += `<p><strong>Occupation:</strong> ${window.userData.lifestyle.occupation} <em>(Consider occupational exposures and hazards)</em></p>`;
                    }
                }
                patientInfoHtml += '</div>';
            }
            
            patientInfoContent.innerHTML = patientInfoHtml;
            patientInfoDiv.appendChild(patientInfoTitle);
            patientInfoDiv.appendChild(patientInfoContent);
            summarySection.appendChild(patientInfoDiv);
        }

        // Clinical Vitals with detailed insights on abnormalities
        if (window.userData.vitals && Object.keys(window.userData.vitals).length > 0) {
            const vitalsDiv = document.createElement('div');
            vitalsDiv.className = 'summary-item';
            
            const vitalsTitle = document.createElement('h4');
            vitalsTitle.textContent = 'Clinical Vitals & Measurements';
            vitalsTitle.className = 'summary-item-title';
            
            const vitalsContent = document.createElement('div');
            vitalsContent.className = 'summary-content';
            
            let vitalsHtml = '<div class="info-subsection"><h5>Vital Signs</h5>';
            
            // Essential vital signs with abnormality detection
            if (window.userData.vitals.pulseRate) {
                const pulse = window.userData.vitals.pulseRate;
                let pulseInsight = '';
                if (pulse < 60) pulseInsight = ' <em>(⚠️ BRADYCARDIA - Consider cardiac conditions, medications, hypothermia)</em>';
                else if (pulse > 100) pulseInsight = ' <em>(⚠️ TACHYCARDIA - May indicate fever, dehydration, anxiety, sepsis, or cardiac issues)</em>';
                else pulseInsight = ' <em>(✓ Normal range)</em>';
                vitalsHtml += `<p><strong>Pulse Rate:</strong> ${pulse} BPM${pulseInsight}</p>`;
            }
            
            if (window.userData.vitals.systolic && window.userData.vitals.diastolic) {
                const systolic = window.userData.vitals.systolic;
                const diastolic = window.userData.vitals.diastolic;
                let bpInsight = '';
                if (systolic >= 180 || diastolic >= 120) bpInsight = ' <em>(🚨 HYPERTENSIVE CRISIS - Immediate medical attention required)</em>';
                else if (systolic >= 140 || diastolic >= 90) bpInsight = ' <em>(⚠️ HYPERTENSION - Cardiovascular risk, medication review needed)</em>';
                else if (systolic < 90 || diastolic < 60) bpInsight = ' <em>(⚠️ HYPOTENSION - Risk of organ hypoperfusion, check for shock)</em>';
                else bpInsight = ' <em>(✓ Normal range)</em>';
                vitalsHtml += `<p><strong>Blood Pressure:</strong> ${systolic}/${diastolic} mmHg${bpInsight}</p>`;
            }
            
            if (window.userData.vitals.oxygenSaturation) {
                const spo2 = window.userData.vitals.oxygenSaturation;
                let spo2Insight = '';
                if (spo2 < 90) spo2Insight = ' <em>(🚨 SEVERE HYPOXEMIA - Respiratory failure, requires immediate oxygen therapy)</em>';
                else if (spo2 < 95) spo2Insight = ' <em>(⚠️ MILD HYPOXEMIA - Monitor respiratory status, consider supplemental oxygen)</em>';
                else spo2Insight = ' <em>(✓ Normal oxygenation)</em>';
                vitalsHtml += `<p><strong>Oxygen Saturation:</strong> ${spo2}%${spo2Insight}</p>`;
            }
            
            if (window.userData.vitals.temperature) {
                const temp = window.userData.vitals.temperature;
                const unit = window.userData.vitals.temperatureUnit || 'F';
                let tempInsight = '';
                if (unit === 'F') {
                    if (temp >= 103) tempInsight = ' <em>(🚨 HIGH FEVER - Risk of febrile seizures, dehydration)</em>';
                    else if (temp >= 100.4) tempInsight = ' <em>(⚠️ FEVER - Indicates infection or inflammatory process)</em>';
                    else if (temp < 96) tempInsight = ' <em>(⚠️ HYPOTHERMIA - May indicate sepsis, exposure, or metabolic issues)</em>';
                    else tempInsight = ' <em>(✓ Normal temperature)</em>';
                } else {
                    if (temp >= 39.4) tempInsight = ' <em>(🚨 HIGH FEVER - Risk of febrile seizures, dehydration)</em>';
                    else if (temp >= 38) tempInsight = ' <em>(⚠️ FEVER - Indicates infection or inflammatory process)</em>';
                    else if (temp < 35.5) tempInsight = ' <em>(⚠️ HYPOTHERMIA - May indicate sepsis, exposure, or metabolic issues)</em>';
                    else tempInsight = ' <em>(✓ Normal temperature)</em>';
                }
                vitalsHtml += `<p><strong>Temperature:</strong> ${temp}°${unit}${tempInsight}</p>`;
            }
            
            if (window.userData.vitals.bloodSugar) {
                const glucose = window.userData.vitals.bloodSugar;
                let glucoseInsight = '';
                if (glucose >= 200) glucoseInsight = ' <em>(⚠️ HYPERGLYCEMIA - Diabetic crisis risk, ketoacidosis concern)</em>';
                else if (glucose < 70) glucoseInsight = ' <em>(⚠️ HYPOGLYCEMIA - Risk of altered mental status, seizures)</em>';
                else glucoseInsight = ' <em>(✓ Normal glucose level)</em>';
                vitalsHtml += `<p><strong>Blood Sugar:</strong> ${glucose} mg/dL${glucoseInsight}</p>`;
            }
            
            vitalsHtml += '</div>';
            
            // Physical measurements with BMI insights
            if (window.userData.vitals.weight || window.userData.vitals.height || window.userData.vitals.bmi) {
                vitalsHtml += '<div class="info-subsection"><h5>Physical Measurements</h5>';
                if (window.userData.vitals.weight) {
                    vitalsHtml += `<p><strong>Weight:</strong> ${window.userData.vitals.weight} ${window.userData.vitals.weightUnit || 'kg'}</p>`;
                }
                if (window.userData.vitals.height) {
                    vitalsHtml += `<p><strong>Height:</strong> ${window.userData.vitals.height} ${window.userData.vitals.heightUnit || 'cm'}</p>`;
                }
                if (window.userData.vitals.bmi) {
                    const bmi = window.userData.vitals.bmi;
                    const category = window.userData.vitals.bmiCategory;
                    let bmiInsight = '';
                    if (bmi < 18.5) bmiInsight = ' <em>(⚠️ UNDERWEIGHT - Nutritional assessment needed, increased infection risk)</em>';
                    else if (bmi >= 30) bmiInsight = ' <em>(⚠️ OBESITY - Increased surgical risk, comorbidity potential)</em>';
                    else if (bmi >= 25) bmiInsight = ' <em>(⚠️ OVERWEIGHT - Monitor for metabolic complications)</em>';
                    else bmiInsight = ' <em>(✓ Normal weight)</em>';
                    vitalsHtml += `<p><strong>BMI:</strong> ${bmi} (${category})${bmiInsight}</p>`;
                }
                vitalsHtml += '</div>';
            }
            
            // Pain assessment
            if (window.userData.vitals.painScale !== undefined) {
                vitalsHtml += '<div class="info-subsection"><h5>Pain Assessment</h5>';
                const pain = window.userData.vitals.painScale;
                let painInsight = '';
                if (pain >= 7) painInsight = ' <em>(⚠️ SEVERE PAIN - Requires immediate pain management, functional impairment)</em>';
                else if (pain >= 4) painInsight = ' <em>(⚠️ MODERATE PAIN - May interfere with daily activities, requires treatment)</em>';
                else if (pain >= 1) painInsight = ' <em>(MILD PAIN - Monitor and provide comfort measures)</em>';
                else painInsight = ' <em>(✓ No pain reported)</em>';
                vitalsHtml += `<p><strong>Pain Level:</strong> ${pain}/10${painInsight}</p>`;
                vitalsHtml += '</div>';
            }
            
            // Additional measurements
            if (window.userData.vitals.respiratoryRate || window.userData.vitals.heartRhythm) {
                vitalsHtml += '<div class="info-subsection"><h5>Additional Measurements</h5>';
                if (window.userData.vitals.respiratoryRate) {
                    const rr = window.userData.vitals.respiratoryRate;
                    let rrInsight = '';
                    if (rr > 24) rrInsight = ' <em>(⚠️ TACHYPNEA - Respiratory distress, metabolic acidosis)</em>';
                    else if (rr < 12) rrInsight = ' <em>(⚠️ BRADYPNEA - CNS depression, drug effect)</em>';
                    else rrInsight = ' <em>(✓ Normal respiratory rate)</em>';
                    vitalsHtml += `<p><strong>Respiratory Rate:</strong> ${rr}/min${rrInsight}</p>`;
                }
                if (window.userData.vitals.heartRhythm && window.userData.vitals.heartRhythm !== 'unknown') {
                    const rhythm = window.userData.vitals.heartRhythm;
                    let rhythmInsight = rhythm === 'irregular' ? 
                        ' <em>(⚠️ IRREGULAR RHYTHM - Requires ECG evaluation, arrhythmia workup)</em>' : 
                        ' <em>(✓ Regular heart rhythm)</em>';
                    vitalsHtml += `<p><strong>Heart Rhythm:</strong> ${rhythm}${rhythmInsight}</p>`;
                }
                vitalsHtml += '</div>';
            }
            
            vitalsContent.innerHTML = vitalsHtml;
            vitalsDiv.appendChild(vitalsTitle);
            vitalsDiv.appendChild(vitalsContent);
            summarySection.appendChild(vitalsDiv);
        }

        // Symptoms Summary with clinical significance
        if (window.userData.symptoms && window.userData.symptoms.length > 0) {
            const symptomsDiv = document.createElement('div');
            symptomsDiv.className = 'summary-item';
            
            const symptomsTitle = document.createElement('h4');
            symptomsTitle.textContent = 'Primary Symptoms';
            symptomsTitle.className = 'summary-item-title';
            
            const symptomsContent = document.createElement('div');
            symptomsContent.className = 'summary-content';
            
            let symptomsHtml = '<div class="info-subsection"><h5>Reported Symptoms</h5>';
            symptomsHtml += '<ul>';
            window.userData.symptoms.forEach(symptom => {
                // Add clinical insights for common symptoms
                let insight = '';
                const lowerSymptom = symptom.toLowerCase();
                if (lowerSymptom.includes('chest pain')) insight = ' <em>(⚠️ RED FLAG - Cardiac evaluation required)</em>';
                else if (lowerSymptom.includes('shortness of breath') || lowerSymptom.includes('dyspnea')) insight = ' <em>(⚠️ Respiratory or cardiac concern)</em>';
                else if (lowerSymptom.includes('severe headache')) insight = ' <em>(⚠️ Neurological evaluation needed)</em>';
                else if (lowerSymptom.includes('abdominal pain')) insight = ' <em>(⚠️ Surgical evaluation may be required)</em>';
                else if (lowerSymptom.includes('fever')) insight = ' <em>(⚠️ Infectious process likely)</em>';
                
                symptomsHtml += `<li>${symptom}${insight}</li>`;
            });
            symptomsHtml += '</ul>';
            
            if (window.userData.freeTextSymptoms) {
                symptomsHtml += `<p><strong>Additional Description:</strong> ${window.userData.freeTextSymptoms}</p>`;
            }
            symptomsHtml += '</div>';
            
            symptomsContent.innerHTML = symptomsHtml;
            symptomsDiv.appendChild(symptomsTitle);
            symptomsDiv.appendChild(symptomsContent);
            summarySection.appendChild(symptomsDiv);
        }

        // Detailed Symptoms from Interview with clinical interpretation
        if (window.userData.detailed_symptoms && Object.keys(window.userData.detailed_symptoms).length > 0) {
            const detailedSymptomsDiv = document.createElement('div');
            detailedSymptomsDiv.className = 'summary-item';
            
            const detailedSymptomsTitle = document.createElement('h4');
            detailedSymptomsTitle.textContent = 'Additional Information (Interview Responses)';
            detailedSymptomsTitle.className = 'summary-item-title';
            
            const detailedSymptomsContent = document.createElement('div');
            detailedSymptomsContent.className = 'summary-content';
            
            let detailedHtml = '<div class="info-subsection"><h5>Structured Assessment Responses</h5>';
            detailedHtml += '<ul>';
            Object.entries(window.userData.detailed_symptoms).forEach(([symptom, answer]) => {
                // Add clinical insights for specific findings
                let insight = '';
                const lowerSymptom = symptom.toLowerCase();
                const lowerAnswer = answer.toString().toLowerCase();
                
                if (lowerAnswer.includes('yes') || lowerAnswer.includes('positive')) {
                    if (lowerSymptom.includes('fever') && lowerSymptom.includes('continuous')) {
                        insight = ' <em>(⚠️ Continuous fever suggests bacterial infection)</em>';
                    } else if (lowerSymptom.includes('blood') && lowerSymptom.includes('stool')) {
                        insight = ' <em>(⚠️ GI bleeding - requires urgent evaluation)</em>';
                    } else if (lowerSymptom.includes('vomiting') && lowerSymptom.includes('eating')) {
                        insight = ' <em>(⚠️ Suggests gastric outlet obstruction or severe gastroparesis)</em>';
                    } else if (lowerSymptom.includes('pain') && lowerSymptom.includes('spreads')) {
                        insight = ' <em>(⚠️ Radiating pain may indicate organ involvement)</em>';
                    } else if (lowerSymptom.includes('recent') && lowerSymptom.includes('travel')) {
                        insight = ' <em>(⚠️ Travel history relevant for endemic diseases)</em>';
                    } else if (lowerSymptom.includes('contact') && lowerSymptom.includes('sick')) {
                        insight = ' <em>(⚠️ Exposure history important for contagious diseases)</em>';
                    }
                }
                
                detailedHtml += `<li><strong>${symptom}:</strong> ${answer}${insight}</li>`;
            });
            detailedHtml += '</ul></div>';
            
            detailedSymptomsContent.innerHTML = detailedHtml;
            detailedSymptomsDiv.appendChild(detailedSymptomsTitle);
            detailedSymptomsDiv.appendChild(detailedSymptomsContent);
            summarySection.appendChild(detailedSymptomsDiv);
        }

        analysisContainer.appendChild(summarySection);

        // Medical Analysis Section
        if (analysis && analysis.analysis) {
            const medicalAnalysisSection = document.createElement('div');
            medicalAnalysisSection.className = 'medical-analysis-section';
            
            const analysisHeader = document.createElement('h3');
            analysisHeader.textContent = 'Medical Analysis';
            analysisHeader.className = 'analysis-section-header';
            medicalAnalysisSection.appendChild(analysisHeader);
            
            const analysisContent = document.createElement('div');
            analysisContent.className = 'analysis-content';
            analysisContent.innerHTML = analysis.analysis;
            medicalAnalysisSection.appendChild(analysisContent);
            
            analysisContainer.appendChild(medicalAnalysisSection);
        }

        // Possible Conditions Section
        if (analysis && analysis.possible_conditions && analysis.possible_conditions.length > 0) {
            const conditionsSection = document.createElement('div');
            conditionsSection.className = 'conditions-section';
            
            const conditionsHeader = document.createElement('h3');
            conditionsHeader.textContent = 'Possible Conditions';
            conditionsHeader.className = 'analysis-section-header';
            conditionsSection.appendChild(conditionsHeader);
            
            const conditionsList = document.createElement('div');
            conditionsList.className = 'conditions-list';
            
            analysis.possible_conditions.forEach((condition, index) => {
                const conditionCard = document.createElement('div');
                conditionCard.className = 'condition-card';
                
                const conditionTitle = document.createElement('h4');
                conditionTitle.className = 'condition-title';
                conditionTitle.textContent = condition.condition || condition.name || `Condition ${index + 1}`;
                
                const conditionProbability = document.createElement('div');
                conditionProbability.className = 'condition-probability';
                const confidence = condition.confidence_score ?? condition.probability ?? condition.likelihood;
                conditionProbability.textContent = `Confidence: ${confidence !== undefined ? confidence : 'Not specified'}`;
                
                // Add ICD-11 code display
                const icdCodeDiv = document.createElement('div');
                icdCodeDiv.className = 'condition-icd-code';
                if (condition.icd11_code && condition.icd11_code !== 'Not specified') {
                    icdCodeDiv.innerHTML = `
                        <div class="icd-code-container">
                            <span class="icd-code-label">ICD-11:</span>
                            <span class="icd-code-value">${condition.icd11_code}</span>
                            ${condition.icd11_title ? `<div class="icd-code-title">${condition.icd11_title}</div>` : ''}
                        </div>
                    `;
                } else {
                    icdCodeDiv.innerHTML = `
                        <div class="icd-code-container">
                            <span class="icd-code-label">ICD-11:</span>
                            <span class="icd-code-pending">Classification pending</span>
                        </div>
                    `;
                }
                
                const conditionDescription = document.createElement('p');
                conditionDescription.className = 'condition-description';
                conditionDescription.textContent = condition.explanation || condition.description || condition.details || 'No description available';
                
                conditionCard.appendChild(conditionTitle);
                conditionCard.appendChild(conditionProbability);
                conditionCard.appendChild(icdCodeDiv);
                conditionCard.appendChild(conditionDescription);
                conditionsList.appendChild(conditionCard);
            });
            
            conditionsSection.appendChild(conditionsList);
            analysisContainer.appendChild(conditionsSection);
        }

        // Recommended Tests Section
        if (analysis && analysis.diagnostic_tests && analysis.diagnostic_tests.length > 0) {
            const testsSection = document.createElement('div');
            testsSection.className = 'tests-section';
            
            const testsHeader = document.createElement('h3');
            testsHeader.textContent = 'Recommended Diagnostic Tests';
            testsHeader.className = 'analysis-section-header';
            testsSection.appendChild(testsHeader);
            
            const testsList = document.createElement('div');
            testsList.className = 'tests-list';
            
            analysis.diagnostic_tests.forEach((test, index) => {
                const testCard = document.createElement('div');
                testCard.className = 'test-card';
                
                const testTitle = document.createElement('h4');
                testTitle.className = 'test-title';
                testTitle.textContent = test.test || test.name || `Test ${index + 1}`;
                
                const testPriority = document.createElement('div');
                testPriority.className = 'test-priority';
                testPriority.textContent = `Priority: ${test.priority || test.urgency || 'Standard'}`;
                
                const testReason = document.createElement('p');
                testReason.className = 'test-reason';
                testReason.textContent = test.explanation || test.reason || test.description || test.purpose || 'Diagnostic evaluation';
                
                testCard.appendChild(testTitle);
                testCard.appendChild(testPriority);
                testCard.appendChild(testReason);
                testsList.appendChild(testCard);
            });
            
            testsSection.appendChild(testsList);
            analysisContainer.appendChild(testsSection);
        }

        // Recommendations Section
        if (analysis && analysis.recommendations) {
            const recommendationsSection = document.createElement('div');
            recommendationsSection.className = 'recommendations-section';
            
            const recommendationsHeader = document.createElement('h3');
            recommendationsHeader.textContent = 'Medical Recommendations';
            recommendationsHeader.className = 'analysis-section-header';
            recommendationsSection.appendChild(recommendationsHeader);
            
            const recommendationsContent = document.createElement('div');
            recommendationsContent.className = 'recommendations-content';
            
            if (typeof analysis.recommendations === 'string') {
                recommendationsContent.innerHTML = analysis.recommendations;
            } else if (Array.isArray(analysis.recommendations)) {
                const recList = document.createElement('ul');
                analysis.recommendations.forEach(rec => {
                    const li = document.createElement('li');
                    li.textContent = rec;
                    recList.appendChild(li);
                });
                recommendationsContent.appendChild(recList);
            }
            
            recommendationsSection.appendChild(recommendationsContent);
            analysisContainer.appendChild(recommendationsSection);
        }

        // Disclaimer
        const disclaimerSection = document.createElement('div');
        disclaimerSection.className = 'disclaimer-section';
        disclaimerSection.innerHTML = `
            <div class="disclaimer-content">
                <h4>⚠️ Important Medical Disclaimer</h4>
                <p><strong>This is an AI-powered medical assessment tool for informational purposes only.</strong></p>
                <ul>
                    <li>This analysis is not a substitute for professional medical diagnosis</li>
                    <li>Always consult with a qualified healthcare provider for proper medical evaluation</li>
                    <li>In case of emergency, contact your local emergency services immediately</li>
                    <li>Do not make medical decisions based solely on this analysis</li>
                </ul>
            </div>
        `;
        
        analysisContainer.appendChild(disclaimerSection);
        container.appendChild(analysisContainer);
    };

    // Initialize the application
    init();

    // Make critical functions globally accessible
    window.showStep = showStep;
    window.analyzeSymptoms = analyzeSymptoms;
    window.updateSidebarNavigation = updateSidebarNavigation;
    // Alias for legacy handlers
    window.showAnalysis = window.analyzeSymptoms;

    // Add event listener for Generate Follow-up Questions button
    const generateQuestionsBtn = document.getElementById('generateQuestionsBtn');
    if (generateQuestionsBtn) {
        generateQuestionsBtn.addEventListener('click', generateFollowupQuestions);
    }

    // Label extraction and visualization functions
    const extractAndDisplayLabels = async () => {
        const symptoms = Array.from(selectedSymptoms);
        const freeText = document.getElementById('freeTextSymptoms')?.value || '';
        
        if (symptoms.length === 0 && !freeText.trim()) {
            document.getElementById('labelExtractionSection').style.display = 'none';
            return;
        }
        
        try {
            // Show loading state
            const extractedLabelsContainer = document.getElementById('extractedLabels');
            extractedLabelsContainer.innerHTML = '<div class="loading-labels">🤖 AI is analyzing your symptoms to extract medical labels...</div>';
            document.getElementById('labelExtractionSection').style.display = 'block';
            
            // Call OpenAI to extract labels
            const labelData = await extractSymptomLabelsWithOpenAI(symptoms, freeText);
            
            if (labelData.label_count > 0) {
                displayLabelExtraction(labelData);
            } else {
                document.getElementById('labelExtractionSection').style.display = 'none';
            }
        } catch (error) {
            console.error('Error extracting labels:', error);
            document.getElementById('labelExtractionSection').style.display = 'none';
        }
    };

    const extractSymptomLabelsWithOpenAI = async (symptoms, freeText) => {
        try {
            const response = await fetch('/extract_labels', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    symptoms: symptoms,
                    free_text: freeText
                })
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status} ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Non-JSON response from label extraction:', text);
                throw new Error('Server returned HTML instead of JSON');
            }

            const labelData = await response.json();
            return labelData;
            
        } catch (error) {
            console.error('Error calling OpenAI for label extraction:', error);
            // Return empty result on error
            return {
                extracted_labels: {},
                label_count: 0,
                correlation_matrix: {},
                feature_questions: []
            };
        }
    };

    const displayLabelExtraction = (labelData) => {
        displayExtractedLabels(labelData.extracted_labels);
        displayCorrelationMatrix(labelData.correlation_matrix);
    };

    const displayExtractedLabels = (extractedLabels) => {
        const container = document.getElementById('extractedLabels');
        container.innerHTML = '';
        
        if (!extractedLabels || Object.keys(extractedLabels).length === 0) {
            container.innerHTML = `
                <div class="labels-empty-state">
                    <div class="empty-state-icon">🏷️</div>
                    <h4 class="empty-state-title">No Labels Detected</h4>
                    <p class="empty-state-description">Try describing your symptoms in more detail to get AI-detected medical labels.</p>
                </div>
            `;
            return;
        }
        
        for (const [label, data] of Object.entries(extractedLabels)) {
            const labelCard = document.createElement('div');
            labelCard.className = 'label-card';
            
            // Determine confidence level for styling
            const confidence = (data.confidence || 'high').toLowerCase();
            const confidenceClass = confidence === 'high' ? 'confidence-high' : 
                                  confidence === 'medium' ? 'confidence-medium' : 'confidence-low';
            
            labelCard.innerHTML = `
                <div class="label-header">
                    <div class="label-title">${label.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</div>
                    <div class="label-confidence ${confidenceClass}">${confidence} confidence</div>
                </div>
                <div class="label-content">
                    <div class="metadata-item">
                        <div class="metadata-label">Relevance</div>
                        <div class="metadata-value">${data.relevance || 'High'}</div>
                    </div>
                    ${data.description ? `
                        <div class="metadata-item">
                            <div class="metadata-label">Description</div>
                            <div class="metadata-value">${data.description}</div>
                        </div>
                    ` : ''}
                    ${data.medical_category ? `
                        <div class="metadata-item">
                            <div class="metadata-label">Category</div>
                            <div class="metadata-value">${data.medical_category}</div>
                        </div>
                    ` : ''}
                </div>
            `;
            
            labelCard.addEventListener('click', () => {
                // Add selection effect
                document.querySelectorAll('.label-card').forEach(card => card.classList.remove('selected'));
                labelCard.classList.add('selected');
            });
            
            container.appendChild(labelCard);
        }
    };

    const displayCorrelationMatrix = (correlationMatrix) => {
        const container = document.getElementById('correlationMatrixContent');
        const section = document.getElementById('correlationMatrix');
        
        if (!correlationMatrix || Object.keys(correlationMatrix).length === 0) {
            section.style.display = 'none';
            return;
        }
        
        section.style.display = 'block';
        container.innerHTML = '';
        
        for (const [label, correlations] of Object.entries(correlationMatrix)) {
            if (!correlations || !Array.isArray(correlations)) continue;
            
            correlations.forEach(correlation => {
                const correlationItem = document.createElement('div');
                correlationItem.className = 'correlation-item';
                
                // Determine strength class
                const strength = (correlation.strength || 'medium').toLowerCase();
                const strengthClass = strength === 'high' ? 'strength-high' : 
                                    strength === 'medium' ? 'strength-medium' : 'strength-low';
                
                correlationItem.innerHTML = `
                    <div class="correlation-header">
                        <div class="correlation-symptoms">
                            ${label.replace(/_/g, ' ')} ↔ ${correlation.label.replace(/_/g, ' ')}
                        </div>
                        <div class="correlation-strength ${strengthClass}">
                            ${strength}
                        </div>
                    </div>
                    <div class="correlation-description">
                        ${correlation.description || `These symptoms show ${strength} correlation based on medical analysis.`}
                    </div>
                    ${correlation.questions && correlation.questions.length > 0 ? `
                        <div class="correlation-clinical-notes">
                            <div class="clinical-notes-title">Clinical Questions</div>
                            <div class="clinical-notes-content">
                                ${correlation.questions.map(q => `• ${q}`).join('<br>')}
                            </div>
                        </div>
                    ` : ''}
                `;
                
                container.appendChild(correlationItem);
            });
        }
    };

    // Enhanced symptom update function
    const updateSelectedSymptomsWithLabels = () => {
        updateSelectedSymptoms(); // Call existing function
        // Don't automatically trigger label extraction
    };

    // Patient History Followup functionality - Updated for Questions
    let followupQuestions = [];
    let currentFollowupQuestionIndex = 0;
    let followupAnswers = [];

    const generateFollowupQuestions = async () => {
        console.log('DEBUG: generateFollowupQuestions called');
        
        try {
            // Show loading state
            document.getElementById('historyFollowupLoading').style.display = 'block';
            document.getElementById('generateQuestionsContainer').style.display = 'none';
            
            // Collect all patient data for question generation
            const patientData = {
                demographics: window.userData.demographics || {},
                medicalConditions: window.userData.medicalConditions || {},
                medicalHistory: window.userData.medicalHistory || {},
                lifestyle: window.userData.lifestyle || {},
                medicalRecords: window.userData.medicalRecords || {},
                vitals: window.userData.vitals || {},
                caseType: window.userData.caseType || ''
            };

            // Call backend to generate follow-up questions
            const response = await fetch('/generate_followup_questions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(patientData)
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status} ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Non-JSON response from followup questions:', text);
                throw new Error('Server returned HTML instead of JSON');
            }

            const questionsData = await response.json();
            console.log('DEBUG: Received questions data:', questionsData);
            
            if (questionsData.questions && questionsData.questions.length > 0) {
                followupQuestions = questionsData.questions;
                currentFollowupQuestionIndex = 0;
                followupAnswers = [];
                
                // Hide loading and show questions section
                document.getElementById('historyFollowupLoading').style.display = 'none';
                document.getElementById('followupQuestionsSection').style.display = 'block';
                
                // Update progress
                updateQuestionsProgress();
                
                // Display first question
                displayCurrentFollowupQuestion();
            } else {
                throw new Error('No questions generated');
            }
            
        } catch (error) {
            console.error('Error generating followup questions:', error);
            document.getElementById('historyFollowupLoading').style.display = 'none';
            
            // Show fallback questions
            displayFallbackFollowupQuestions();
        }
    };

    const displayFallbackFollowupQuestions = () => {
        // Generate basic fallback questions based on available data
        const patientData = window.userData;
        followupQuestions = [];
        
        // Age-based questions
        if (patientData.demographics?.age) {
            const age = parseInt(patientData.demographics.age);
            if (age > 65) {
                followupQuestions.push({
                    id: 1,
                    category: "age_related",
                    question: "As a senior patient, do you experience any memory issues or confusion?",
                    type: "multiple_choice",
                    options: ["No memory issues", "Occasional forgetfulness", "Frequent confusion", "Significant memory problems"],
                    relevance: "Age-related cognitive assessment for patients over 65"
                });
            } else if (age < 18) {
                followupQuestions.push({
                    id: 1,
                    category: "pediatric",
                    question: "For pediatric patients, are there any developmental concerns?",
                    type: "multiple_choice",
                    options: ["Normal development", "Some delays", "Significant concerns", "Not sure"],
                    relevance: "Developmental assessment for pediatric patients"
                });
            }
        }
        
        // Vitals-based questions
        if (patientData.vitals?.temperature && parseFloat(patientData.vitals.temperature) > 100.4) {
            followupQuestions.push({
                id: 2,
                category: "fever_assessment",
                question: "You have an elevated temperature. How long have you had this fever?",
                type: "multiple_choice",
                options: ["Less than 24 hours", "1-3 days", "4-7 days", "More than a week"],
                relevance: "Duration assessment for fever management"
            });
        }
        
        if (patientData.vitals?.systolic && parseInt(patientData.vitals.systolic) > 140) {
            followupQuestions.push({
                id: 3,
                category: "hypertension_assessment",
                question: "Your blood pressure is elevated. Do you take blood pressure medications?",
                type: "multiple_choice",
                options: ["Yes, regularly", "Yes, but irregularly", "No, not prescribed", "No, but should be"],
                relevance: "Medication compliance assessment for hypertension"
            });
        }
        
        // Gender-specific questions
        if (patientData.demographics?.gender === 'female') {
            followupQuestions.push({
                id: 4,
                category: "female_health",
                question: "Are you currently menstruating regularly?",
                type: "multiple_choice",
                options: ["Yes, regularly", "Irregular periods", "Menopause", "Not applicable"],
                relevance: "Female reproductive health assessment"
            });
        }
        
        // Medical conditions follow-up
        if (patientData.medicalConditions?.diabetes === 'yes') {
            followupQuestions.push({
                id: 5,
                category: "diabetes_management",
                question: "How well controlled is your diabetes currently?",
                type: "multiple_choice",
                options: ["Well controlled", "Moderately controlled", "Poorly controlled", "Not sure"],
                relevance: "Diabetes management assessment"
            });
        }
        
        // Ensure we have at least some questions
        if (followupQuestions.length === 0) {
            followupQuestions = [
                {
                    id: 1,
                    category: "general_health",
                    question: "How would you describe your overall health in the past month?",
                    type: "multiple_choice",
                    options: ["Excellent", "Good", "Fair", "Poor"],
                    relevance: "General health status assessment"
                },
                {
                    id: 2,
                    category: "symptom_duration",
                    question: "How long have you been experiencing your current symptoms?",
                    type: "multiple_choice",
                    options: ["Less than 24 hours", "1-3 days", "1 week", "More than a week"],
                    relevance: "Symptom timeline for diagnostic assessment"
                },
                {
                    id: 3,
                    category: "functional_impact",
                    question: "How much do your current symptoms affect your daily activities?",
                    type: "multiple_choice",
                    options: ["Not at all", "Slightly", "Moderately", "Severely"],
                    relevance: "Functional impact assessment"
                }
            ];
        }
        
        currentFollowupQuestionIndex = 0;
        followupAnswers = [];
        
        // Show questions section
        document.getElementById('followupQuestionsSection').style.display = 'block';
        updateQuestionsProgress();
        displayCurrentFollowupQuestion();
    };

    const updateQuestionsProgress = () => {
        const totalQuestions = followupQuestions.length;
        const currentNumber = currentFollowupQuestionIndex + 1;
        const percentage = Math.round(((currentFollowupQuestionIndex + 1) / totalQuestions) * 100);
        
        document.getElementById('currentQuestionNumber').textContent = currentNumber;
        document.getElementById('totalQuestions').textContent = totalQuestions;
        document.getElementById('progressPercent').textContent = percentage;
        document.getElementById('questionsProgressFill').style.width = percentage + '%';
    };

    const displayCurrentFollowupQuestion = () => {
        if (currentFollowupQuestionIndex >= followupQuestions.length) {
            showFollowupQuestionsSummary();
            return;
        }
        
        const question = followupQuestions[currentFollowupQuestionIndex];
        const container = document.getElementById('currentQuestionContainer');
        
        let questionHtml = `
            <div class="current-question-card">
                <div class="question-header">
                    <div class="question-category">${question.category.replace(/_/g, ' ').toUpperCase()}</div>
                    <h4 class="question-text">${question.question}</h4>
                    <p class="question-relevance">${question.relevance}</p>
                </div>
                <div class="question-answer-section">
        `;
        
        if (question.type === 'multiple_choice') {
            questionHtml += '<div class="question-options">';
            question.options.forEach((option, index) => {
                questionHtml += `
                    <label class="option-label">
                        <input type="radio" name="currentAnswer" value="${option}" data-index="${index}">
                        <span class="option-text">${option}</span>
                    </label>
                `;
            });
            questionHtml += '</div>';
        } else if (question.type === 'textarea') {
            questionHtml += `
                <textarea class="question-textarea" name="currentAnswer" placeholder="${question.placeholder || 'Please provide details...'}"></textarea>
            `;
        } else if (question.type === 'scale') {
            questionHtml += `
                <div class="scale-container">
                    <input type="range" class="scale-slider" name="currentAnswer" 
                           min="${question.min}" max="${question.max}" value="${Math.round((question.min + question.max) / 2)}">
                    <div class="scale-value">${Math.round((question.min + question.max) / 2)}</div>
                    <div class="scale-labels">
                        <span class="min-label">${question.min_label}</span>
                        <span class="max-label">${question.max_label}</span>
                    </div>
                </div>
            `;
        }
        
        questionHtml += '</div></div>';
        
        container.innerHTML = questionHtml;
        
        // Add event listeners for scale input
        if (question.type === 'scale') {
            const slider = container.querySelector('.scale-slider');
            const valueDisplay = container.querySelector('.scale-value');
            slider.addEventListener('input', (e) => {
                valueDisplay.textContent = e.target.value;
            });
        }
        
        // Update navigation buttons
        updateFollowupNavigationButtons();
    };

    const updateFollowupNavigationButtons = () => {
        const prevBtn = document.getElementById('prevQuestionBtn');
        const nextBtn = document.getElementById('nextQuestionBtn');
        const completeBtn = document.getElementById('completeQuestionsBtn');
        
        // Show/hide previous button
        if (currentFollowupQuestionIndex > 0) {
            prevBtn.style.display = 'inline-block';
        } else {
            prevBtn.style.display = 'none';
        }
        
        // Show/hide next vs complete button
        if (currentFollowupQuestionIndex >= followupQuestions.length - 1) {
            nextBtn.style.display = 'none';
            completeBtn.style.display = 'inline-block';
        } else {
            nextBtn.style.display = 'inline-block';
            completeBtn.style.display = 'none';
        }
    };

    const saveCurrentFollowupAnswer = () => {
        const question = followupQuestions[currentFollowupQuestionIndex];
        const container = document.getElementById('currentQuestionContainer');
        let answer = '';
        
        if (question.type === 'multiple_choice') {
            const selected = container.querySelector('input[name="currentAnswer"]:checked');
            answer = selected ? selected.value : '';
        } else if (question.type === 'textarea') {
            const textarea = container.querySelector('textarea[name="currentAnswer"]');
            answer = textarea ? textarea.value : '';
        } else if (question.type === 'scale') {
            const slider = container.querySelector('input[name="currentAnswer"]');
            answer = slider ? slider.value : '';
        }
        
        // Save or update answer
        followupAnswers[currentFollowupQuestionIndex] = {
            questionId: question.id,
            question: question.question,
            answer: answer,
            category: question.category
        };
        
        return answer !== '';
    };

    const nextFollowupQuestion = () => {
        if (saveCurrentFollowupAnswer()) {
            currentFollowupQuestionIndex++;
            updateQuestionsProgress();
            displayCurrentFollowupQuestion();
        } else {
            alert('Please answer the current question before proceeding.');
        }
    };

    const prevFollowupQuestion = () => {
        if (currentFollowupQuestionIndex > 0) {
            currentFollowupQuestionIndex--;
            updateQuestionsProgress();
            displayCurrentFollowupQuestion();
        }
    };

    const completeFollowupQuestions = () => {
        if (saveCurrentFollowupAnswer()) {
            // Save all answers to userData
            window.userData.followupAnswers = followupAnswers;
            
            showFollowupQuestionsSummary();
        } else {
            alert('Please answer the current question before completing.');
        }
    };

    const showFollowupQuestionsSummary = () => {
        document.getElementById('followupQuestionsSection').style.display = 'none';
        document.getElementById('questionsSummary').style.display = 'block';
        
        // Display answered questions summary
        const summaryContainer = document.getElementById('answeredQuestions');
        let summaryHtml = '<div class="answered-questions-grid">';
        
        followupAnswers.forEach((answer, index) => {
            summaryHtml += `
                <div class="answered-question-item">
                    <div class="answer-question">${answer.question}</div>
                    <div class="answer-response"><strong>Answer:</strong> ${answer.answer}</div>
                    <div class="answer-category">Category: ${answer.category.replace(/_/g, ' ')}</div>
                </div>
            `;
        });
        
        summaryHtml += '</div>';
        summaryContainer.innerHTML = summaryHtml;
        
        // Update main step validation
        window.userData.patientHistoryFollowupComplete = true;
        updateNavigationValidation();
    };

    const reviewFollowupAnswers = () => {
        document.getElementById('questionsSummary').style.display = 'none';
        document.getElementById('followupQuestionsSection').style.display = 'block';
        
        // Go back to first question for review
        currentFollowupQuestionIndex = 0;
        updateQuestionsProgress();
        displayCurrentFollowupQuestion();
    };

    const proceedToSymptoms = () => {
        // Move to next step (Symptoms)
        window.currentStep = 4;
        window.showStep(window.currentStep);
    };

    // Event listeners for Patient History Followup
    document.addEventListener('DOMContentLoaded', function() {
        const generateQuestionsBtn = document.getElementById('generateQuestionsBtn');
        const nextQuestionBtn = document.getElementById('nextQuestionBtn');
        const prevQuestionBtn = document.getElementById('prevQuestionBtn');
        const completeQuestionsBtn = document.getElementById('completeQuestionsBtn');
        const reviewAnswersBtn = document.getElementById('reviewAnswersBtn');
        const proceedToSymptomsBtn = document.getElementById('proceedToSymptomsBtn');
        
        if (generateQuestionsBtn) {
            generateQuestionsBtn.addEventListener('click', generateFollowupQuestions);
        }
        
        if (nextQuestionBtn) {
            nextQuestionBtn.addEventListener('click', nextFollowupQuestion);
        }
        
        if (prevQuestionBtn) {
            prevQuestionBtn.addEventListener('click', prevFollowupQuestion);
        }
        
        if (completeQuestionsBtn) {
            completeQuestionsBtn.addEventListener('click', completeFollowupQuestions);
        }
        
        if (reviewAnswersBtn) {
            reviewAnswersBtn.addEventListener('click', reviewFollowupAnswers);
        }
        
        if (proceedToSymptomsBtn) {
            proceedToSymptomsBtn.addEventListener('click', proceedToSymptoms);
        }
    });

    // Make function globally accessible
    window.generateFollowupQuestions = generateFollowupQuestions;
});

// Ensure helper UIs use window-scoped data to avoid ReferenceError outside the DOMContentLoaded scope
function displayQuestion(questionData) {
    if (!questionData) return;
    
    const questionContainer = document.getElementById('followupQuestions');
    const question = questionData.question;
    const questionType = questionData.type;
    const options = questionData.options || [];
    const helpText = questionData.help_text || '';
    
    let questionHtml = `
        <div class="question-item">
            <h3>${question}</h3>
            ${helpText ? `<p class="help-text">${helpText}</p>` : ''}
    `;
    
    if (questionType === 'multiple_choice') {
        questionHtml += '<div class="options-container">';
        options.forEach((option, index) => {
            questionHtml += `
                <label class="option-label">
                    <input type="radio" name="followup_answer" value="${option}" data-index="${index}">
                    <span class="option-text">${option}</span>
                </label>
            `;
        });
        questionHtml += '</div>';
    } else if (questionType === 'slider') {
        questionHtml += `
            <div class="slider-container">
                <div class="slider-wrapper">
                    <input type="range" 
                           name="followup_answer" 
                           id="intensitySlider"
                           min="${question.min}" 
                           max="${question.max}" 
                           step="${question.step || 1}"
                           value="${Math.round((question.min + question.max) / 2)}"
                           class="intensity-slider">
                    <div class="slider-value-display">
                        <span id="sliderValue">${Math.round((question.min + question.max) / 2)}</span>/10
                    </div>
                </div>
                <div class="slider-labels">
                    ${Object.entries(question.labels || {}).map(([value, label]) => 
                        `<div class="slider-label" data-value="${value}">
                            <span class="label-value">${value}</span>
                            <span class="label-text">${label}</span>
                        </div>`
                    ).join('')}
                </div>
            </div>
        `;
    } else if (questionType === 'textarea') {
        questionHtml += `
            <div class="textarea-container">
                <textarea name="followup_answer" 
                         placeholder="${question.placeholder || 'Please provide details...'}"
                         rows="4" 
                         class="followup-textarea"></textarea>
            </div>
        `;
    } else {
        // Default text input
        questionHtml += `
            <div class="input-container">
                <input type="text" name="followup_answer" placeholder="Please provide your answer..." class="followup-input">
            </div>
        `;
    }
    
    questionHtml += `
            <div class="question-actions">
                <button type="button" onclick="submitFollowupAnswer()" class="submit-btn">Submit Answer</button>
            </div>
        </div>
    `;
    
    questionContainer.innerHTML = questionHtml;
    
    // Add slider event listener for real-time value updates
    if (questionType === 'slider') {
        const slider = document.getElementById('intensitySlider');
        const valueDisplay = document.getElementById('sliderValue');
        
        slider.addEventListener('input', function() {
            valueDisplay.textContent = this.value;
            
            // Highlight the corresponding label
            document.querySelectorAll('.slider-label').forEach(label => {
                label.classList.remove('active');
            });
            
            const activeLabel = document.querySelector(`[data-value="${this.value}"]`);
            if (activeLabel) {
                activeLabel.classList.add('active');
            }
        });
        
        // Set initial active label
        const initialValue = slider.value;
        const initialLabel = document.querySelector(`[data-value="${initialValue}"]`);
        if (initialLabel) {
            initialLabel.classList.add('active');
        }
    }
    
    // Scroll to the question
    questionContainer.scrollIntoView({ behavior: 'smooth' });
}

function submitFollowupAnswer() {
    const answerInput = document.querySelector('input[name="followup_answer"]:checked') || 
                       document.querySelector('input[name="followup_answer"]') ||
                       document.querySelector('textarea[name="followup_answer"]');
    
    if (!answerInput || !answerInput.value.trim()) {
        alert('Please provide an answer before proceeding.');
        return;
    }
    
    const answer = answerInput.value.trim();

    if (!window.patientData.detailed_symptoms) {
        window.patientData.detailed_symptoms = {};
    }
    
    // Use a timestamp-based key to store each answer uniquely
    const questionKey = `question_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const questionText = document.querySelector('.question-item h3').textContent;
    
    window.patientData.detailed_symptoms[questionKey] = {
        question: questionText,
        answer: answer,
        timestamp: new Date().toISOString()
    };
    
    // Show loading state
    const questionContainer = document.getElementById('followupQuestions');
    questionContainer.innerHTML = '<div class="loading">Processing your answer...</div>';
    
    // Get the next follow-up question
    fetch('/followup', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(window.patientData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.question && !data.completed) {
            displayQuestion(data.question);
        } else if (data.completed || (data.question && data.final_question)) {
            // Show completion message and proceed to analysis
            questionContainer.innerHTML = `
                <div class="completion-message">
                    <h3>✓ OPQRST Assessment Complete</h3>
                    <p>All symptoms have been analyzed using the comprehensive OPQRST framework:</p>
                    <ul>
                        <li><strong>O</strong>nset - When symptoms started</li>
                        <li><strong>P</strong>rovocation/Palliation - What makes it better/worse</li>
                        <li><strong>Q</strong>uality - How symptoms feel</li>
                        <li><strong>R</strong>egion/Radiation - Where symptoms are located</li>
                        <li><strong>S</strong>everity - Intensity level</li>
                        <li><strong>T</strong>iming - Duration and patterns</li>
                    </ul>
                    <button onclick="showAnalysis()" class="analysis-btn">Get Medical Analysis</button>
                </div>
            `;
        }
    })
    .catch(error => {
        console.error('Error:', error);
        questionContainer.innerHTML = `
            <div class="error-message">
                <p>Error getting next question. Please try again.</p>
                <button onclick="submitFollowupAnswer()" class="retry-btn">Retry</button>
            </div>
        `;
    });
};

// Progress tracking functions
const updateInterviewProgress = () => {
    const progressContainer = document.getElementById('interviewProgress');
    const currentQuestionSpan = document.getElementById('currentQuestion');
    const progressPercentage = document.querySelector('.progress-percentage');
    const progressFill = document.getElementById('progressFill');
    
    if (!progressContainer) return; // Exit if elements don't exist
    
    // Calculate current question number (number of answered questions + 1)
    const answeredQuestions = Object.keys(window.userData.detailed_symptoms || {}).length;
    const currentQuestionNumber = answeredQuestions + 1;
    const percentage = Math.min((currentQuestionNumber / 10) * 100, 100);
    
    // Update UI
    if (currentQuestionSpan) currentQuestionSpan.textContent = `${currentQuestionNumber}`;
    if (progressPercentage) progressPercentage.textContent = `${Math.round(percentage)}%`;
    if (progressFill) progressFill.style.width = `${percentage}%`;
    
    // Show progress container
    progressContainer.style.display = 'block';
};

const showQuestionLoading = () => {
    const loadingContainer = document.getElementById('questionLoading');
    const questionsContainer = document.getElementById('followupQuestions');
    
    if (loadingContainer) loadingContainer.style.display = 'block';
    if (questionsContainer) questionsContainer.style.display = 'none';
};

const hideQuestionLoading = () => {
    const loadingContainer = document.getElementById('questionLoading');
    const questionsContainer = document.getElementById('followupQuestions');
    
    if (loadingContainer) loadingContainer.style.display = 'none';
    if (questionsContainer) questionsContainer.style.display = 'block';
};

const showResultsLoading = () => {
    const loadingContainer = document.getElementById('resultsLoading');
    const resultsContainer = document.getElementById('analysisResults');
    
    if (loadingContainer) loadingContainer.style.display = 'block';
    if (resultsContainer) resultsContainer.style.display = 'none';
};

const hideResultsLoading = () => {
    const loadingContainer = document.getElementById('resultsLoading');
    const resultsContainer = document.getElementById('analysisResults');
    
    if (loadingContainer) loadingContainer.style.display = 'none';
    if (resultsContainer) resultsContainer.style.display = 'block';
};

const displayFollowUpQuestion = (question) => {
    const container = document.getElementById('followupQuestions');
    container.innerHTML = '';
    
    const questionContainer = document.createElement('div');
    questionContainer.className = 'question-container';
    
    const questionText = document.createElement('h3');
    questionText.textContent = question.question;
    questionContainer.appendChild(questionText);

    // Create input based on question type
    let inputElement;
    if (question.type === 'slider') {
        inputElement = createSliderInput();
    } else if (question.type === 'checkbox') {
        inputElement = createCheckboxInput(question.options);
    } else if (question.type === 'radio') {
        inputElement = createRadioInput(question.options);
    } else if (question.type === 'multiple_choice') {
        inputElement = createMultipleChoiceInput(question.options);
    } else if (question.type === 'textarea') {
        inputElement = createTextareaInput();
    } else {
        inputElement = createTextInput();
    }
    
    questionContainer.appendChild(inputElement);
    
    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-primary';
    submitBtn.textContent = 'Submit Answer';
    submitBtn.onclick = () => submitFollowUpAnswer(question);
    questionContainer.appendChild(submitBtn);
    
    container.appendChild(questionContainer);
};

const createRadioInput = (options) => {
    const container = document.createElement('div');
    container.className = 'radio-options-interview';
    
    options.forEach((option, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'radio-option-interview';
        
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.id = `interview-option-${index}`;
        radio.name = 'interview-radio';
        radio.value = option;
        radio.className = 'radio-input-interview';
        
        const label = document.createElement('label');
        label.htmlFor = `interview-option-${index}`;
        label.textContent = option;
        label.className = 'radio-label-interview';
        
        wrapper.appendChild(radio);
        wrapper.appendChild(label);
        container.appendChild(wrapper);
    });
    
    return container;
};

const createMultipleChoiceInput = (options) => {
    const container = document.createElement('div');
    container.className = 'multiple-choice-options';
    
    options.forEach((option, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'multiple-choice-btn';
        button.textContent = option;
        button.value = option;
        button.id = `choice-${index}`;
        
        button.addEventListener('click', () => {
            // Remove selection from all buttons
            container.querySelectorAll('.multiple-choice-btn').forEach(btn => 
                btn.classList.remove('selected'));
            // Select clicked button
            button.classList.add('selected');
        });
        
        container.appendChild(button);
    });
    
    return container;
};

const createSliderInput = () => {
    const container = document.createElement('div');
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = '10';
    slider.value = '5';
    slider.id = 'current-question';
    slider.className = 'form-range';
    
    const valueDisplay = document.createElement('div');
    valueDisplay.textContent = '5';
    valueDisplay.style.textAlign = 'center';
    valueDisplay.style.marginTop = '1rem';
    
    slider.addEventListener('input', (e) => {
        valueDisplay.textContent = e.target.value;
    });
    
    container.appendChild(slider);
    container.appendChild(valueDisplay);
    return container;
};

const createCheckboxInput = (options) => {
    const container = document.createElement('div');
    options.forEach(option => {
        const wrapper = document.createElement('div');
        wrapper.style.marginBottom = '0.5rem';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `option-${option}`;
        checkbox.value = option;
        
        const label = document.createElement('label');
        label.htmlFor = `option-${option}`;
        label.textContent = option;
        label.style.marginLeft = '0.5rem';
        
        wrapper.appendChild(checkbox);
        wrapper.appendChild(label);
        container.appendChild(wrapper);
    });
    return container;
};

const createTextInput = () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'current-question';
    input.className = 'form-control';
    input.style.marginBottom = '1rem';
    return input;
};

const createTextareaInput = () => {
    const textarea = document.createElement('textarea');
    textarea.id = 'current-question';
    textarea.className = 'form-control';
    textarea.rows = 4;
    textarea.placeholder = 'Please provide any additional information that might be helpful...';
    textarea.style.marginBottom = '1rem';
    return textarea;
};

const submitFollowUpAnswer = async (question) => {
    let answer;
    if (question.type === 'checkbox') {
        const checkedBoxes = document.querySelectorAll('#followupQuestions input[type="checkbox"]:checked');
        answer = Array.from(checkedBoxes).map(cb => cb.value);
    } else if (question.type === 'radio') {
        const selectedRadio = document.querySelector('#followupQuestions input[type="radio"]:checked');
        answer = selectedRadio ? selectedRadio.value : '';
    } else if (question.type === 'multiple_choice') {
        const selectedChoice = document.querySelector('#followupQuestions .multiple-choice-btn.selected');
        answer = selectedChoice ? selectedChoice.value : '';
    } else {
        const input = document.getElementById('current-question');
        answer = input.value;
    }

    // Validate answer
    if (!answer || (Array.isArray(answer) && answer.length === 0)) {
        alert('Please provide an answer before continuing.');
        return;
    }

    if (!window.userData.detailed_symptoms) {
        window.userData.detailed_symptoms = {};
    }
    window.userData.detailed_symptoms[question.question] = answer;

    await window.getFollowUpQuestions();
};

// Display structured symptom questions in table format
const displayStructuredQuestions = (questions) => {
    const container = document.getElementById('followupQuestions');
    container.innerHTML = '';
    
    // Create header
    const headerDiv = document.createElement('div');
    headerDiv.className = 'structured-questions-header';
    headerDiv.innerHTML = `
        <h3>Symptom / Question Assessment</h3>
        <p class="subtitle">Please answer these questions based on the information collected (Case Type, Patient, Symptoms). 
           The aim is to gather additional information that will help in diagnosis and recommend appropriate diagnostic tests.</p>
    `;
    container.appendChild(headerDiv);
    
    // Create table container
    const tableContainer = document.createElement('div');
    tableContainer.className = 'structured-questions-table';
    
    // Create table
    const table = document.createElement('table');
    table.className = 'symptom-questions-table';
    
    // Create table header
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th class="symptom-col">Symptom / Question</th>
            <th class="yes-col">Yes</th>
            <th class="no-col">No</th>
            <th class="notes-col">Notes / Description</th>
        </tr>
    `;
    table.appendChild(thead);
    
    // Create table body
    const tbody = document.createElement('tbody');
    
    questions.forEach((question, index) => {
        const row = document.createElement('tr');
        row.className = 'symptom-question-row';
        row.setAttribute('data-symptom', question.symptom);
        
        // Symptom/Question column
        const symptomCell = document.createElement('td');
        symptomCell.className = 'symptom-cell';
        symptomCell.textContent = question.symptom;
        
        // Yes column
        const yesCell = document.createElement('td');
        yesCell.className = 'yes-cell';
        const yesCheckbox = document.createElement('input');
        yesCheckbox.type = 'checkbox';
        yesCheckbox.className = 'yes-checkbox';
        yesCheckbox.id = `yes-${index}`;
        yesCheckbox.name = `symptom-${index}`;
        yesCheckbox.value = 'yes';
        yesCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                // Uncheck the "No" checkbox
                const noCheckbox = row.querySelector('.no-checkbox');
                noCheckbox.checked = false;
            }
            updateStructuredAnswers();
        });
        yesCell.appendChild(yesCheckbox);
        
        // No column
        const noCell = document.createElement('td');
        noCell.className = 'no-cell';
        const noCheckbox = document.createElement('input');
        noCheckbox.type = 'checkbox';
        noCheckbox.className = 'no-checkbox';
        noCheckbox.id = `no-${index}`;
        noCheckbox.name = `symptom-${index}`;
        noCheckbox.value = 'no';
        noCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                // Uncheck the "Yes" checkbox
                const yesCheckbox = row.querySelector('.yes-checkbox');
                yesCheckbox.checked = false;
            }
            updateStructuredAnswers();
        });
        noCell.appendChild(noCheckbox);
        
        // Notes column
        const notesCell = document.createElement('td');
        notesCell.className = 'notes-cell';
        const notesInput = document.createElement('input');
        notesInput.type = 'text';
        notesInput.className = 'notes-input';
        notesInput.id = `notes-${index}`;
        notesInput.placeholder = question.notes_hint || 'Enter notes...';
        notesInput.addEventListener('input', updateStructuredAnswers);
        notesCell.appendChild(notesInput);
        
        // Append cells to row
        row.appendChild(symptomCell);
        row.appendChild(yesCell);
        row.appendChild(noCell);
        row.appendChild(notesCell);
        
        tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    tableContainer.appendChild(table);
    container.appendChild(tableContainer);
    
    // Add submit button
    const submitContainer = document.createElement('div');
    submitContainer.className = 'structured-questions-submit';
    
    const submitButton = document.createElement('button');
    submitButton.className = 'btn btn-primary submit-structured-btn';
    submitButton.textContent = 'Submit Answers';
    submitButton.addEventListener('click', submitStructuredAnswers);
    
    submitContainer.appendChild(submitButton);
    container.appendChild(submitContainer);
    
    // Add note about completion
    const noteDiv = document.createElement('div');
    noteDiv.className = 'completion-note';
    noteDiv.innerHTML = `
        <p><strong>Note:</strong> You can leave questions blank if not applicable. 
           Focus on symptoms and factors relevant to your condition.</p>
    `;
    container.appendChild(noteDiv);
};

// Update structured answers in userData
const updateStructuredAnswers = () => {
    if (!window.userData.detailed_symptoms) {
        window.userData.detailed_symptoms = {};
    }
    
    const rows = document.querySelectorAll('.symptom-question-row');
    rows.forEach((row, index) => {
        const symptom = row.getAttribute('data-symptom');
        const yesChecked = row.querySelector('.yes-checkbox').checked;
        const noChecked = row.querySelector('.no-checkbox').checked;
        const notes = row.querySelector('.notes-input').value.trim();
        
        if (yesChecked || noChecked || notes) {
            let answer = '';
            if (yesChecked) answer = 'Yes';
            else if (noChecked) answer = 'No';
            else answer = 'Not specified';
            
            if (notes) {
                answer += ` - ${notes}`;
            }
            
            window.userData.detailed_symptoms[symptom] = answer;
        }
    });
};

// Submit structured answers
const submitStructuredAnswers = async () => {
    console.log('DEBUG: Submit button clicked!');
    
    try {
        // Use global userData and update it
        window.userData = window.userData || {};
        
        // Update answers one final time
        updateStructuredAnswers();
        
        console.log('DEBUG: Current window.userData.detailed_symptoms:', window.userData.detailed_symptoms);
        
        // Check if at least some questions are answered
        const answeredQuestions = Object.keys(window.userData.detailed_symptoms || {}).length;
        if (answeredQuestions === 0) {
            alert('Please answer at least some questions before submitting.');
            return;
        }
        
        // Show loading
        const submitBtn = document.querySelector('.submit-structured-btn');
        if (!submitBtn) {
            console.error('DEBUG: Submit button not found!');
            return;
        }
        
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Processing...';
        submitBtn.disabled = true;
        submitBtn.classList.add('loading');
        
        console.log('DEBUG: Moving to next step (Results)');
        console.log('DEBUG: Current step before increment:', window.currentStep);
        
        // Move to next step (analysis) - use global variables
        window.currentStep = 6; // Go directly to results step (step 6)
        console.log('DEBUG: Current step after increment:', window.currentStep);
        
        // Use the global showStep function
        if (typeof window.showStep === 'function') {
            console.log('DEBUG: Calling showStep function');
            window.showStep(window.currentStep);
        } else {
            console.error('DEBUG: showStep function not available');
            // Fallback: manually show the results step
            document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
            const resultsStep = document.getElementById('step-6');
            if (resultsStep) {
                resultsStep.classList.add('active');
            }
        }
        
        // Call analysis function
        if (typeof window.analyzeSymptoms === 'function') {
            console.log('DEBUG: Calling analyzeSymptoms function');
            window.analyzeSymptoms();
        } else {
            console.error('DEBUG: analyzeSymptoms function not available');
            // Fallback: show a simple results message
            const resultsContainer = document.getElementById('analysisResults');
            if (resultsContainer) {
                resultsContainer.innerHTML = `
                    <div class="analysis-container">
                        <h3>Analysis Complete</h3>
                        <p>Your structured questionnaire has been submitted successfully.</p>
                        <div class="summary-section">
                            <h4>Responses Collected:</h4>
                            <ul>
                                ${Object.entries(window.userData.detailed_symptoms || {}).map(([symptom, answer]) => 
                                    `<li><strong>${symptom}:</strong> ${answer}</li>`
                                ).join('')}
                            </ul>
                        </div>
                    </div>
                `;
            }
        }
        
    } catch (error) {
        console.error('Error submitting structured answers:', error);
        const submitBtn = document.querySelector('.submit-structured-btn');
        if (submitBtn) {
            submitBtn.textContent = 'Submit Answers';
            submitBtn.disabled = false;
            submitBtn.classList.remove('loading');
        }
        alert('Error submitting answers. Please try again.');
    }
};

// Make the function globally accessible
window.submitStructuredAnswers = submitStructuredAnswers;

// Add missing window functions for global access
window.skipToResults = () => {
    window.currentStep = 6;
    if (typeof window.showStep === 'function') {
        window.showStep(window.currentStep);
    }
    if (typeof window.analyzeSymptoms === 'function') {
        window.analyzeSymptoms();
    }
};

// Patient History Followup functionality - Updated for Questions
let followupQuestions = [];
let currentFollowupQuestionIndex = 0;
let followupAnswers = [];

const generateFollowupQuestions = async () => {
    console.log('DEBUG: generateFollowupQuestions called');
    
    try {
        // Show loading state
        document.getElementById('historyFollowupLoading').style.display = 'block';
        document.getElementById('generateQuestionsContainer').style.display = 'none';
        
        // Collect all patient data for question generation
        const patientData = {
            demographics: window.userData.demographics || {},
            medicalConditions: window.userData.medicalConditions || {},
            medicalHistory: window.userData.medicalHistory || {},
            lifestyle: window.userData.lifestyle || {},
            medicalRecords: window.userData.medicalRecords || {},
            vitals: window.userData.vitals || {},
            caseType: window.userData.caseType || ''
        };

        // Call backend to generate follow-up questions
        const response = await fetch('/generate_followup_questions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(patientData)
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Non-JSON response from followup questions:', text);
            throw new Error('Server returned HTML instead of JSON');
        }

        const questionsData = await response.json();
        console.log('DEBUG: Received questions data:', questionsData);
        
        if (questionsData.questions && questionsData.questions.length > 0) {
            followupQuestions = questionsData.questions;
            currentFollowupQuestionIndex = 0;
            followupAnswers = [];
            
            // Hide loading and show questions section
            document.getElementById('historyFollowupLoading').style.display = 'none';
            document.getElementById('followupQuestionsSection').style.display = 'block';
            
            // Update progress
            updateQuestionsProgress();
            
            // Display first question
            displayCurrentFollowupQuestion();
        } else {
            throw new Error('No questions generated');
        }
        
    } catch (error) {
        console.error('Error generating followup questions:', error);
        document.getElementById('historyFollowupLoading').style.display = 'none';
        
        // Show fallback questions
        displayFallbackFollowupQuestions();
    }
};

const displayFallbackFollowupQuestions = () => {
    // Generate basic fallback questions based on available data
    const patientData = window.userData;
    followupQuestions = [];
    
    // Age-based questions
    if (patientData.demographics?.age) {
        const age = parseInt(patientData.demographics.age);
        if (age > 65) {
            followupQuestions.push({
                id: 1,
                category: "age_related",
                question: "As a senior patient, do you experience any memory issues or confusion?",
                type: "multiple_choice",
                options: ["No memory issues", "Occasional forgetfulness", "Frequent confusion", "Significant memory problems"],
                relevance: "Age-related cognitive assessment for patients over 65"
            });
        } else if (age < 18) {
            followupQuestions.push({
                id: 1,
                category: "pediatric",
                question: "For pediatric patients, are there any developmental concerns?",
                type: "multiple_choice",
                options: ["Normal development", "Some delays", "Significant concerns", "Not sure"],
                relevance: "Developmental assessment for pediatric patients"
            });
        }
    }
    
    // Vitals-based questions
    if (patientData.vitals?.temperature && parseFloat(patientData.vitals.temperature) > 100.4) {
        followupQuestions.push({
            id: 2,
            category: "fever_assessment",
            question: "You have an elevated temperature. How long have you had this fever?",
            type: "multiple_choice",
            options: ["Less than 24 hours", "1-3 days", "4-7 days", "More than a week"],
            relevance: "Duration assessment for fever management"
        });
    }
    
    if (patientData.vitals?.systolic && parseInt(patientData.vitals.systolic) > 140) {
        followupQuestions.push({
            id: 3,
            category: "hypertension_assessment",
            question: "Your blood pressure is elevated. Do you take blood pressure medications?",
            type: "multiple_choice",
            options: ["Yes, regularly", "Yes, but irregularly", "No, not prescribed", "No, but should be"],
            relevance: "Medication compliance assessment for hypertension"
        });
    }
    
    // Gender-specific questions
    if (patientData.demographics?.gender === 'female') {
        followupQuestions.push({
            id: 4,
            category: "female_health",
            question: "Are you currently menstruating regularly?",
            type: "multiple_choice",
            options: ["Yes, regularly", "Irregular periods", "Menopause", "Not applicable"],
            relevance: "Female reproductive health assessment"
        });
    }
    
    // Medical conditions follow-up
    if (patientData.medicalConditions?.diabetes === 'yes') {
        followupQuestions.push({
            id: 5,
            category: "diabetes_management",
            question: "How well controlled is your diabetes currently?",
            type: "multiple_choice",
            options: ["Well controlled", "Moderately controlled", "Poorly controlled", "Not sure"],
            relevance: "Diabetes management assessment"
        });
    }
    
    // Ensure we have at least some questions
    if (followupQuestions.length === 0) {
        followupQuestions = [
            {
                id: 1,
                category: "general_health",
                question: "How would you describe your overall health in the past month?",
                type: "multiple_choice",
                options: ["Excellent", "Good", "Fair", "Poor"],
                relevance: "General health status assessment"
            },
            {
                id: 2,
                category: "symptom_duration",
                question: "How long have you been experiencing your current symptoms?",
                type: "multiple_choice",
                options: ["Less than 24 hours", "1-3 days", "1 week", "More than a week"],
                relevance: "Symptom timeline for diagnostic assessment"
            },
            {
                id: 3,
                category: "functional_impact",
                question: "How much do your current symptoms affect your daily activities?",
                type: "multiple_choice",
                options: ["Not at all", "Slightly", "Moderately", "Severely"],
                relevance: "Functional impact assessment"
            }
        ];
    }
    
    currentFollowupQuestionIndex = 0;
    followupAnswers = [];
    
    // Show questions section
    document.getElementById('followupQuestionsSection').style.display = 'block';
    updateQuestionsProgress();
    displayCurrentFollowupQuestion();
};

const updateQuestionsProgress = () => {
    const totalQuestions = followupQuestions.length;
    const currentNumber = currentFollowupQuestionIndex + 1;
    const percentage = Math.round(((currentFollowupQuestionIndex + 1) / totalQuestions) * 100);
    
    document.getElementById('currentQuestionNumber').textContent = currentNumber;
    document.getElementById('totalQuestions').textContent = totalQuestions;
    document.getElementById('progressPercent').textContent = percentage;
    document.getElementById('questionsProgressFill').style.width = percentage + '%';
};

const displayCurrentFollowupQuestion = () => {
    if (currentFollowupQuestionIndex >= followupQuestions.length) {
        showFollowupQuestionsSummary();
        return;
    }
    
    const question = followupQuestions[currentFollowupQuestionIndex];
    const container = document.getElementById('currentQuestionContainer');
    
    let questionHtml = `
        <div class="current-question-card">
            <div class="question-header">
                <div class="question-category">${question.category.replace(/_/g, ' ').toUpperCase()}</div>
                <h4 class="question-text">${question.question}</h4>
                <p class="question-relevance">${question.relevance}</p>
            </div>
            <div class="question-answer-section">
    `;
    
    if (question.type === 'multiple_choice') {
        questionHtml += '<div class="question-options">';
        question.options.forEach((option, index) => {
            questionHtml += `
                <label class="option-label">
                    <input type="radio" name="currentAnswer" value="${option}" data-index="${index}">
                    <span class="option-text">${option}</span>
                </label>
            `;
        });
        questionHtml += '</div>';
    } else if (question.type === 'textarea') {
        questionHtml += `
            <textarea class="question-textarea" name="currentAnswer" placeholder="${question.placeholder || 'Please provide details...'}"></textarea>
        `;
    } else if (question.type === 'scale') {
        questionHtml += `
            <div class="scale-container">
                <input type="range" class="scale-slider" name="currentAnswer" 
                       min="${question.min}" max="${question.max}" value="${Math.round((question.min + question.max) / 2)}">
                <div class="scale-value">${Math.round((question.min + question.max) / 2)}</div>
                <div class="scale-labels">
                    <span class="min-label">${question.min_label}</span>
                    <span class="max-label">${question.max_label}</span>
                </div>
            </div>
        `;
    }
    
    questionHtml += '</div></div>';
    
    container.innerHTML = questionHtml;
    
    // Add event listeners for scale input
    if (question.type === 'scale') {
        const slider = container.querySelector('.scale-slider');
        const valueDisplay = container.querySelector('.scale-value');
        slider.addEventListener('input', (e) => {
            valueDisplay.textContent = e.target.value;
        });
    }
    
    // Update navigation buttons
    updateFollowupNavigationButtons();
};

const updateFollowupNavigationButtons = () => {
    const prevBtn = document.getElementById('prevQuestionBtn');
    const nextBtn = document.getElementById('nextQuestionBtn');
    const completeBtn = document.getElementById('completeQuestionsBtn');
    
    // Show/hide previous button
    if (currentFollowupQuestionIndex > 0) {
        prevBtn.style.display = 'inline-block';
    } else {
        prevBtn.style.display = 'none';
    }
    
    // Show/hide next vs complete button
    if (currentFollowupQuestionIndex >= followupQuestions.length - 1) {
        nextBtn.style.display = 'none';
        completeBtn.style.display = 'inline-block';
    } else {
        nextBtn.style.display = 'inline-block';
        completeBtn.style.display = 'none';
    }
};

const saveCurrentFollowupAnswer = () => {
    const question = followupQuestions[currentFollowupQuestionIndex];
    const container = document.getElementById('currentQuestionContainer');
    let answer = '';
    
    if (question.type === 'multiple_choice') {
        const selected = container.querySelector('input[name="currentAnswer"]:checked');
        answer = selected ? selected.value : '';
    } else if (question.type === 'textarea') {
        const textarea = container.querySelector('textarea[name="currentAnswer"]');
        answer = textarea ? textarea.value : '';
    } else if (question.type === 'scale') {
        const slider = container.querySelector('input[name="currentAnswer"]');
        answer = slider ? slider.value : '';
    }
    
    // Save or update answer
    followupAnswers[currentFollowupQuestionIndex] = {
        questionId: question.id,
        question: question.question,
        answer: answer,
        category: question.category
    };
    
    return answer !== '';
};

const nextFollowupQuestion = () => {
    if (saveCurrentFollowupAnswer()) {
        currentFollowupQuestionIndex++;
        updateQuestionsProgress();
        displayCurrentFollowupQuestion();
    } else {
        alert('Please answer the current question before proceeding.');
    }
};

const prevFollowupQuestion = () => {
    if (currentFollowupQuestionIndex > 0) {
        currentFollowupQuestionIndex--;
        updateQuestionsProgress();
        displayCurrentFollowupQuestion();
    }
};

const completeFollowupQuestions = () => {
    if (saveCurrentFollowupAnswer()) {
        // Save all answers to userData
        window.userData.followupAnswers = followupAnswers;
        
        showFollowupQuestionsSummary();
    } else {
        alert('Please answer the current question before completing.');
    }
};

const showFollowupQuestionsSummary = () => {
    document.getElementById('followupQuestionsSection').style.display = 'none';
    document.getElementById('questionsSummary').style.display = 'block';
    
    // Display answered questions summary
    const summaryContainer = document.getElementById('answeredQuestions');
    let summaryHtml = '<div class="answered-questions-grid">';
    
    followupAnswers.forEach((answer, index) => {
        summaryHtml += `
            <div class="answered-question-item">
                <div class="answer-question">${answer.question}</div>
                <div class="answer-response"><strong>Answer:</strong> ${answer.answer}</div>
                <div class="answer-category">Category: ${answer.category.replace(/_/g, ' ')}</div>
            </div>
        `;
    });
    
    summaryHtml += '</div>';
    summaryContainer.innerHTML = summaryHtml;
    
    // Update main step validation
    window.userData.patientHistoryFollowupComplete = true;
    updateNavigationValidation();
};

const reviewFollowupAnswers = () => {
    document.getElementById('questionsSummary').style.display = 'none';
    document.getElementById('followupQuestionsSection').style.display = 'block';
    
    // Go back to first question for review
    currentFollowupQuestionIndex = 0;
    updateQuestionsProgress();
    displayCurrentFollowupQuestion();
};

const proceedToSymptoms = () => {
    // Move to next step (Symptoms)
    window.currentStep = 4;
    window.showStep(window.currentStep);
};

// Event listeners for Patient History Followup
document.addEventListener('DOMContentLoaded', function() {
    const generateQuestionsBtn = document.getElementById('generateQuestionsBtn');
    const nextQuestionBtn = document.getElementById('nextQuestionBtn');
    const prevQuestionBtn = document.getElementById('prevQuestionBtn');
    const completeQuestionsBtn = document.getElementById('completeQuestionsBtn');
    const reviewAnswersBtn = document.getElementById('reviewAnswersBtn');
    const proceedToSymptomsBtn = document.getElementById('proceedToSymptomsBtn');
    
    if (generateQuestionsBtn) {
        generateQuestionsBtn.addEventListener('click', generateFollowupQuestions);
    }
    
    if (nextQuestionBtn) {
        nextQuestionBtn.addEventListener('click', nextFollowupQuestion);
    }
    
    if (prevQuestionBtn) {
        prevQuestionBtn.addEventListener('click', prevFollowupQuestion);
    }
    
    if (completeQuestionsBtn) {
        completeQuestionsBtn.addEventListener('click', completeFollowupQuestions);
    }
    
    if (reviewAnswersBtn) {
        reviewAnswersBtn.addEventListener('click', reviewFollowupAnswers);
    }
    
    if (proceedToSymptomsBtn) {
        proceedToSymptomsBtn.addEventListener('click', proceedToSymptoms);
    }
});

// Make function globally accessible
window.generateFollowupQuestions = generateFollowupQuestions;