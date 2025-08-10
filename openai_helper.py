import os
import json
import re
import time
import random
from openai import OpenAI
from typing import List, Dict

class OpenAIHelper:
    def __init__(self):
        self.client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
        self.model = "gpt-4.1-nano"  # Updated to use gpt-4.1-nano as requested
        self.question_history = []
        self.symptom_analysis_state = {
            'all_questions': [],  # Pre-generated list of all questions
            'current_question_index': 0,  # Current position in the question sequence
            'total_questions': 0,  # Total number of questions to ask
            'symptoms_processed': False,  # Whether we've generated all questions
            # New: state for individual follow-up questions flow
            'individual_questions': [],
            'individual_index': 0
        }

    def _clean_json_response(self, content: str) -> str:
        """Clean the response content by removing markdown code blocks and other formatting."""
        # Remove markdown code blocks
        content = re.sub(r'```(?:json)?\s*(.*?)\s*```', r'\1', content, flags=re.DOTALL)
        # Remove leading/trailing whitespace and newlines
        content = content.strip()
        return content

    def _make_openai_request_with_retry(self, request_func, max_retries=3, base_delay=1):
        """
        Make OpenAI API request with exponential backoff retry logic to handle 500 errors.
        """
        for attempt in range(max_retries):
            try:
                return request_func()
            except Exception as e:
                error_message = str(e).lower()
                
                # Check if it's a retryable error (500, rate limit, timeout)
                if any(error_type in error_message for error_type in ['500', 'rate limit', 'timeout', 'server error', 'internal server error']):
                    if attempt < max_retries - 1:  # Don't sleep on the last attempt
                        # Exponential backoff with jitter
                        delay = base_delay * (2 ** attempt) + random.uniform(0, 1)
                        print(f"OpenAI API error (attempt {attempt + 1}/{max_retries}): {e}. Retrying in {delay:.2f} seconds...")
                        time.sleep(delay)
                        continue
                
                # If it's not retryable or we've exhausted retries, raise the error
                raise e
        
        # This shouldn't be reached, but just in case
        raise Exception(f"Failed to complete OpenAI request after {max_retries} attempts")

    def get_symptom_suggestions(self, user_input: str) -> List[str]:
        # Create a comprehensive prompt for symptom matching
        prompt = f"""User input: '{user_input}'
        Provide EXACTLY 10 relevant medical symptoms as suggestions.

        Guidelines:
        1. Ensure direct relevance to the input
        2. Include both exact matches and related symptoms
        3. Use simple, everyday language
        4. Keep descriptions to 2-4 words
        5. List EXACTLY 10 suggestions, no more, no less
        6. Format: "symptom (brief description)"

        Example format for "headache":
        [
            "headache (pain in head)",
            "migraine (severe pulsing headache)",
            "tension headache (tight band feeling)",
            "sinus pain (face pressure)",
            "neck pain (stiff neck)",
            "dizziness (room spinning)",
            "eye strain (tired eyes)",
            "ear pain (throbbing ear)",
            "fever (high temperature)",
            "fatigue (feeling very tired)"
        ]

        Important: 
        - Always return exactly 10 items
        - Ensure first suggestions are most relevant
        - Include common related symptoms
        """

        try:
            # Use retry wrapper for OpenAI API call
            def make_request():
                return self.client.chat.completions.create(
                    model=self.model,
                    messages=[{
                        "role": "system",
                        "content": "You are a medical symptom suggestion system. Provide relevant symptom suggestions in simple language."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }],
                    temperature=0.3,
                    max_tokens=500,
                    presence_penalty=0.3,
                    frequency_penalty=0.3
                )
            
            response = self._make_openai_request_with_retry(make_request)
            content = self._clean_json_response(response.choices[0].message.content)
            suggestions = json.loads(content)
            
            # Ensure exactly 10 suggestions
            if len(suggestions) < 10:
                # Add fallback symptoms if needed
                common_symptoms = [
                    "fatigue (feeling very tired)",
                    "fever (elevated temperature)",
                    "pain (general discomfort)",
                    "weakness (reduced strength)",
                    "dizziness (light headed feeling)"
                ]
                suggestions.extend([s for s in common_symptoms if s not in suggestions])
            
            return suggestions[:10]
            
        except Exception as e:
            print(f"Error in get_symptom_suggestions: {e}")
            # Fallback suggestions
            return [
                f"{user_input} (main symptom)",
                "fever (high temperature)",
                "pain (general discomfort)",
                "fatigue (feeling tired)",
                "headache (head pain)",
                "nausea (feeling sick)",
                "dizziness (light headed)",
                "weakness (reduced strength)",
                "chills (feeling cold)",
                "sweating (excess moisture)"
            ]

    def get_followup_questions(self, data: Dict) -> Dict:
        """
        Generate structured symptom questions based on case type, patient information, and selected symptoms.
        Uses enhanced label extraction and correlation analysis.
        Returns questions in a format similar to a medical intake form with Yes/No/Notes structure.
        """
        case_type = data.get('caseType', '')
        symptoms = data.get('symptoms', [])
        free_text_symptoms = data.get('freeTextSymptoms', '')
        demographics = data.get('demographics', {})
        
        print(f"DEBUG: ==> get_followup_questions called")  # Debug log
        print(f"DEBUG: ==> Case type: {case_type}")  # Debug log
        print(f"DEBUG: ==> Symptoms received: {symptoms}")  # Debug log
        print(f"DEBUG: ==> Free text: '{free_text_symptoms}'")  # Debug log
        
        # Generate structured questions based on case type and symptoms
        if not self.symptom_analysis_state['symptoms_processed']:
            print(f"DEBUG: ==> Generating enhanced structured symptom questions with label extraction...")  # Debug log
            
            # Use enhanced version with label extraction and correlation analysis
            structured_questions = []
            try:
                structured_questions = self._generate_enhanced_structured_questions(
                    case_type, symptoms, free_text_symptoms, demographics
                )
                print(f"DEBUG: ==> Enhanced questions generated: {len(structured_questions)}")
            except Exception as e:
                print(f"WARN: Enhanced question generation failed: {e}")
                # Fallback to OpenAI dynamic generation
                try:
                    structured_questions = self._generate_dynamic_symptom_questions_openai(
                        case_type, symptoms, free_text_symptoms, demographics
                    )
                    print(f"DEBUG: ==> OpenAI dynamic questions generated: {len(structured_questions)}")
                except Exception as e2:
                    print(f"WARN: OpenAI dynamic question generation failed: {e2}")
                    # Final fallback to rule-based generator
                    structured_questions = self._generate_structured_symptom_questions(
                        case_type, symptoms, free_text_symptoms, demographics
                    )
                    print(f"DEBUG: ==> Fallback structured questions generated: {len(structured_questions)}")
            
            print(f"DEBUG: ==> Generated {len(structured_questions)} structured questions")  # Debug log
            
            # Store in state
            self.symptom_analysis_state['all_questions'] = structured_questions
            self.symptom_analysis_state['total_questions'] = len(structured_questions)
            self.symptom_analysis_state['symptoms_processed'] = True
            
            print(f"DEBUG: ==> State updated - total_questions set to: {self.symptom_analysis_state['total_questions']}")  # Debug log
        else:
            print(f"DEBUG: ==> Using previously generated questions")  # Debug log
        
        # For structured questions, return all at once instead of one by one
        if self.symptom_analysis_state['current_question_index'] == 0:
            print("DEBUG: ==> Returning enhanced structured symptom questionnaire")  # Debug log
            
            # Mark as processed to avoid regeneration
            self.symptom_analysis_state['current_question_index'] = self.symptom_analysis_state['total_questions']
            
            return {
                "structured_questions": self.symptom_analysis_state['all_questions'],
                "completed": False,
                "question_type": "structured_form",
                "label_extraction_enabled": True
            }
        else:
            print("DEBUG: ==> Structured questionnaire completed")  # Debug log
            return {"question": None, "completed": True}

    def _generate_structured_symptom_questions(self, case_type: str, symptoms: List[str], free_text: str, demographics: Dict) -> List[Dict]:
        """
        Generate structured symptom questions based on the case type, selected symptoms, and patient demographics.
        This creates a comprehensive symptom checklist similar to medical intake forms.
        """
        questions = []
        
        # Base questions that apply to all cases
        base_questions = [
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
        ]
        
        # Add case-type specific questions
        case_specific_questions = self._get_case_specific_questions(case_type)
        
        # Add symptom-specific follow-up questions
        symptom_specific_questions = self._get_symptom_specific_questions(symptoms, free_text)
        
        # Combine all questions
        all_questions = base_questions + case_specific_questions + symptom_specific_questions
        
        # Remove duplicates and format for frontend
        seen_symptoms = set()
        for q in all_questions:
            symptom_key = q["symptom"].lower()
            if symptom_key not in seen_symptoms:
                seen_symptoms.add(symptom_key)
                questions.append({
                    "symptom": q["symptom"],
                    "category": q.get("category", "general"),
                    "notes_hint": q.get("notes_hint", ""),
                    "type": "yes_no_notes"
                })
        
        print(f"DEBUG: Generated {len(questions)} structured questions")
        return questions
    
    def _get_case_specific_questions(self, case_type: str) -> List[Dict]:
        """Get additional questions specific to the case type"""
        case_questions = {
            "accident": [
                {"symptom": "Loss of consciousness", "category": "neurological", "notes_hint": "How long"},
                {"symptom": "Memory loss around the event", "category": "neurological", "notes_hint": ""},
                {"symptom": "Confusion or disorientation", "category": "neurological", "notes_hint": ""},
                {"symptom": "Difficulty speaking clearly", "category": "neurological", "notes_hint": ""},
                {"symptom": "Numbness or tingling", "category": "neurological", "notes_hint": "Where"},
                {"symptom": "Vision changes", "category": "neurological", "notes_hint": "Describe"},
                {"symptom": "Difficulty moving limbs", "category": "musculoskeletal", "notes_hint": "Which limbs"},
                {"symptom": "Visible deformity", "category": "physical", "notes_hint": "Location"},
                {"symptom": "Swelling at injury site", "category": "physical", "notes_hint": ""},
                {"symptom": "Bruising or discoloration", "category": "physical", "notes_hint": "Color/location"}
            ],
            "infection": [
                {"symptom": "Known outbreak in area", "category": "epidemiological", "notes_hint": "What disease"},
                {"symptom": "Others in household sick", "category": "epidemiological", "notes_hint": "How many"},
                {"symptom": "Exposure to animals", "category": "risk_factors", "notes_hint": "What animals"},
                {"symptom": "Insect or tick bites", "category": "risk_factors", "notes_hint": "When/where"},
                {"symptom": "Drinking untreated water", "category": "risk_factors", "notes_hint": "Source"},
                {"symptom": "Night sweats", "category": "general", "notes_hint": "How often"},
                {"symptom": "Swollen lymph nodes", "category": "general", "notes_hint": "Location"},
                {"symptom": "Difficulty swallowing", "category": "throat", "notes_hint": ""},
                {"symptom": "Cough with blood", "category": "respiratory", "notes_hint": "Amount"},
                {"symptom": "Rapid breathing", "category": "respiratory", "notes_hint": ""}
            ],
            "sick": [
                {"symptom": "Gradual onset over days", "category": "temporal", "notes_hint": "How many days"},
                {"symptom": "Sudden onset within hours", "category": "temporal", "notes_hint": "Exact time"},
                {"symptom": "Symptoms getting worse", "category": "temporal", "notes_hint": "How fast"},
                {"symptom": "Previous similar episodes", "category": "history", "notes_hint": "When"},
                {"symptom": "Family history of similar illness", "category": "history", "notes_hint": "Who"},
                {"symptom": "Taking any medications", "category": "medications", "notes_hint": "List all"},
                {"symptom": "Missed medication doses", "category": "medications", "notes_hint": "Which ones"},
                {"symptom": "New medications started", "category": "medications", "notes_hint": "When started"},
                {"symptom": "Stress or emotional changes", "category": "psychosocial", "notes_hint": "What kind"}
            ],
            "addiction": [
                {"symptom": "Withdrawal symptoms", "category": "addiction", "notes_hint": "Which symptoms"},
                {"symptom": "Craving for substance", "category": "addiction", "notes_hint": "How strong"},
                {"symptom": "Last substance use", "category": "addiction", "notes_hint": "When exactly"},
                {"symptom": "Amount typically used", "category": "addiction", "notes_hint": "Daily amount"},
                {"symptom": "Shaking or tremors", "category": "neurological", "notes_hint": "Which parts"},
                {"symptom": "Anxiety or panic", "category": "psychological", "notes_hint": "Severity"},
                {"symptom": "Hallucinations", "category": "psychological", "notes_hint": "Visual/auditory"},
                {"symptom": "Sleep disturbances", "category": "general", "notes_hint": "How many hours"},
                {"symptom": "Loss of appetite", "category": "general", "notes_hint": "For how long"},
                {"symptom": "Rapid heart rate", "category": "cardiovascular", "notes_hint": ""}
            ]
        }
        
        return case_questions.get(case_type, [])
    
    def _get_symptom_specific_questions(self, symptoms: List[str], free_text: str) -> List[Dict]:
        """Generate specific follow-up questions based on selected symptoms"""
        specific_questions = []
        
        # Analyze symptoms and add relevant questions
        for symptom in symptoms:
            clean_symptom = symptom.lower()
            
            if any(keyword in clean_symptom for keyword in ['pain', 'ache', 'hurt']):
                specific_questions.extend([
                    {"symptom": f"Pain radiates to other areas", "category": "pain", "notes_hint": "Where"},
                    {"symptom": f"Pain worse with movement", "category": "pain", "notes_hint": "Which movements"},
                    {"symptom": f"Pain relief with rest", "category": "pain", "notes_hint": "How much relief"}
                ])
            
            if any(keyword in clean_symptom for keyword in ['cough', 'breathing']):
                specific_questions.extend([
                    {"symptom": "Cough produces phlegm", "category": "respiratory", "notes_hint": "Color/amount"},
                    {"symptom": "Shortness of breath at rest", "category": "respiratory", "notes_hint": ""},
                    {"symptom": "Wheezing sounds", "category": "respiratory", "notes_hint": "When"},
                    {"symptom": "Chest tightness", "category": "respiratory", "notes_hint": ""}
                ])
            
            if any(keyword in clean_symptom for keyword in ['fever', 'temperature']):
                specific_questions.extend([
                    {"symptom": "Fever measured with thermometer", "category": "general", "notes_hint": "Exact temperature"},
                    {"symptom": "Fever responds to medication", "category": "general", "notes_hint": "Which medication"},
                    {"symptom": "Fever pattern changes", "category": "general", "notes_hint": "How"}
                ])
        
        # Add questions based on free text analysis
        if free_text:
            # Simple keyword analysis of free text
            text_lower = free_text.lower()
            if 'dizziness' in text_lower or 'dizzy' in text_lower:
                specific_questions.append({"symptom": "Dizziness when standing up", "category": "neurological", "notes_hint": "How severe"})
            if 'fatigue' in text_lower or 'tired' in text_lower:
                specific_questions.append({"symptom": "Fatigue interferes with daily activities", "category": "general", "notes_hint": "What activities"})
        
        return specific_questions

    def analyze_symptoms(self, data: Dict) -> Dict:
        demographics = data.get('demographics', {})
        history = data.get('history', {})
        symptoms = data.get('symptoms', [])
        detailed_symptoms = data.get('detailed_symptoms', {})
        free_text = data.get('freeTextSymptoms', '')
        regions = data.get('regions', [])
        
        # Enhanced analysis prompt with comprehensive OPQRST framework and ICD-11 codes
        prompt = f"""You are a world-class diagnostic physician conducting comprehensive medical analysis using the complete OPQRST framework.

PATIENT PROFILE:
- Demographics: Age {demographics.get('age', 'unknown')}, Gender: {demographics.get('gender', 'unknown')}
- Geographic Regions: {', '.join(regions)}
- Medical History: {json.dumps(history)}
- Primary Symptoms: {', '.join(symptoms)}
- Patient Description: {free_text}
- Detailed OPQRST Analysis: {json.dumps(detailed_symptoms)}

ANALYSIS REQUIREMENTS:
1. Apply systematic differential diagnosis using OPQRST findings
2. Consider epidemiology, risk factors, and demographics  
3. Prioritize based on urgency, probability, and OPQRST patterns
4. Use evidence-based medicine principles
5. Account for all OPQRST components in diagnostic reasoning
6. Include accurate ICD-11 codes for each condition

Provide analysis in this EXACT JSON format:
{{
    "possible_conditions": [
        {{
            "condition": "Primary Condition Name",
            "confidence_score": 85,
            "icd11_code": "1A00.0Z",
            "icd11_title": "Official ICD-11 condition title",
            "explanation": "Detailed clinical reasoning incorporating complete OPQRST findings, demographics, and risk factors."
        }}
    ],
    "diagnostic_tests": [
        {{
            "test": "Specific Test Name",
            "confidence_score": 90,
            "priority": "urgent/routine",
            "explanation": "Clinical rationale based on OPQRST findings and differential diagnosis requirements"
        }}
    ],
    "red_flags": ["List any concerning OPQRST features that suggest urgent evaluation"],
    "immediate_care": ["Specific actionable recommendations"],
    "follow_up": {{
        "urgency": "emergency/urgent/routine",
        "timeline": "Specific timeframe",
        "reason": "Why this timeline"
    }},
    "lifestyle": ["Relevant lifestyle modifications"],
    "disclaimer": "Important medical disclaimer"
}}

DIAGNOSTIC CRITERIA:
- Emergency: Life-threatening conditions requiring immediate intervention
- Urgent: Serious conditions requiring evaluation within hours
- Routine: Stable conditions that can be evaluated within days

ICD-11 CODE REQUIREMENTS:
- Use the most current ICD-11 classification codes
- Provide both the code (e.g., "1A00.0Z") and official title
- Ensure codes match the clinical condition accurately
- Use unspecified codes (.Z) when specific variants cannot be determined
- Include primary codes for main conditions, not just symptom codes

Focus on clinical excellence, patient safety, comprehensive OPQRST-based systematic reasoning, and accurate medical coding."""
        
        try:
            # Use retry wrapper for OpenAI API call
            def make_request():
                return self.client.chat.completions.create(
                    model=self.model,
                    messages=[{
                        "role": "system",
                        "content": "You are a world-class diagnostic physician with expertise in comprehensive OPQRST symptom analysis, systematic clinical reasoning, and accurate ICD-11 medical coding. Provide thorough, accurate medical analysis with proper ICD-11 classification codes based on complete OPQRST assessment."
                    }, {
                        "role": "user", 
                        "content": prompt
                    }],
                    temperature=0.1,
                    max_tokens=1500
                )
            
            response = self._make_openai_request_with_retry(make_request)
            content = self._clean_json_response(response.choices[0].message.content)
            result = json.loads(content)
            
            # Validate and ensure proper response format
            if 'possible_conditions' not in result:
                result['possible_conditions'] = []
            if 'diagnostic_tests' not in result:
                result['diagnostic_tests'] = []
            if 'red_flags' not in result:
                result['red_flags'] = []
            if 'immediate_care' not in result:
                result['immediate_care'] = []
            if 'follow_up' not in result:
                result['follow_up'] = {
                    'urgency': 'routine',
                    'timeline': 'As appropriate',
                    'reason': 'Professional evaluation recommended'
                }
            if 'lifestyle' not in result:
                result['lifestyle'] = []
            if 'disclaimer' not in result:
                result['disclaimer'] = 'This tool is not a substitute for professional medical advice, diagnosis, or treatment.'
            
            # Ensure ICD-11 codes are present in conditions
            for condition in result['possible_conditions']:
                if 'icd11_code' not in condition or not condition['icd11_code']:
                    condition['icd11_code'] = 'Not specified'
                if 'icd11_title' not in condition or not condition['icd11_title']:
                    condition['icd11_title'] = 'ICD-11 classification pending'
            
            return result
            
        except Exception as e:
            print(f"Error in analyze_symptoms: {e}")
            return {
                'possible_conditions': [{
                    'condition': 'Comprehensive Clinical Assessment Required',
                    'confidence_score': 95,
                    'icd11_code': 'Z51.8',
                    'icd11_title': 'Other specified medical care',
                    'explanation': 'The symptoms described require professional medical evaluation for accurate diagnosis using complete OPQRST analysis.'
                }],
                'diagnostic_tests': [{
                    'test': 'Comprehensive Medical Evaluation',
                    'confidence_score': 98,
                    'priority': 'urgent',
                    'explanation': 'Complete history, physical examination, and appropriate diagnostic testing by a qualified healthcare provider.'
                }],
                'red_flags': ['Any worsening symptoms', 'New concerning symptoms'],
                'immediate_care': ['Seek medical attention if symptoms worsen'],
                'follow_up': {
                    'urgency': 'urgent',
                    'timeline': 'Within 24-48 hours',
                    'reason': 'Professional evaluation needed for accurate diagnosis'
                },
                'lifestyle': ['Follow medical advice from healthcare provider'],
                'disclaimer': 'This tool is not a substitute for professional medical advice, diagnosis, or treatment.'
            }

    def reset_conversation(self):
        """Reset the conversation state for a new diagnostic session"""
        self.question_history = []
        self.symptom_analysis_state = {
            'all_questions': [],
            'current_question_index': 0,
            'total_questions': 0,
            'symptoms_processed': False,
            # Reset individual follow-up flow state
            'individual_questions': [],
            'individual_index': 0
        }

    def get_diagnosis_and_recommendations(self, data: Dict) -> Dict:
        """
        Generate comprehensive diagnosis and recommendations based on all collected information
        """
        prompt = f"""You are an experienced physician providing diagnostic analysis and recommendations.

PATIENT DATA:
Demographics: {json.dumps(data.get('demographics', {}))}
Medical History: {json.dumps(data.get('history', {}))}
Primary Symptoms: {', '.join(data.get('symptoms', []))}
Free Text Description: {data.get('freeTextSymptoms', '')}
Detailed Symptom Analysis: {json.dumps(data.get('detailed_symptoms', {}))}

PROVIDE:

1. POSSIBLE CONDITIONS (3-5 most likely conditions with confidence scores):
   - List conditions from most to least likely
   - Include confidence score (0-100%)
   - One-line explanation for each condition

2. RECOMMENDED DIAGNOSTIC TESTS (with confidence scores):
   - Include confidence score (0-100%) for test necessity
   - Priority order (urgent vs routine)
   - One-line rationale for each test

3. RED FLAGS requiring immediate medical attention:
   - Specific warning signs to watch for
   - When to seek emergency care

4. IMMEDIATE CARE RECOMMENDATIONS:
   - What patient can do now
   - Symptom management
   - Activity restrictions

5. FOLLOW-UP TIMELINE:
   - When to see a doctor
   - Urgency level (emergency, urgent, routine)

6. LIFESTYLE MODIFICATIONS:
   - Relevant diet, activity, or environmental changes

Format as JSON:
{{
    "possible_conditions": [
        {{
            "condition": "Condition name",
            "confidence_score": 85,
            "explanation": "One-line explanation of why this condition is likely based on symptoms"
        }}
    ],
    "diagnostic_tests": [
        {{
            "test": "Test name",
            "confidence_score": 90,
            "priority": "Urgent/Routine",
            "explanation": "One-line rationale for why this test is recommended"
        }}
    ],
    "red_flags": [
        "Specific warning sign to watch for"
    ],
    "immediate_care": [
        "Specific actionable recommendation"
    ],
    "follow_up": {{
        "urgency": "Emergency/Urgent/Routine",
        "timeline": "Specific timeframe",
        "reason": "Why this timeline"
    }},
    "lifestyle": [
        "Relevant lifestyle modification"
    ],
    "disclaimer": "Important medical disclaimer"
}}

IMPORTANT: 
- Base confidence scores on symptom match, patient demographics, and clinical evidence
- Confidence scores should reflect diagnostic certainty (100% = definitive, 50% = possible, <30% = unlikely)
- For diagnostic tests: higher confidence = more essential for diagnosis
- Be specific and actionable with one-line explanations
- Consider patient's age and medical history
- Include appropriate medical disclaimers
- Focus on patient safety"""

        try:
            # Use retry wrapper for OpenAI API call
            def make_request():
                return self.client.chat.completions.create(
                    model=self.model,
                    messages=[{
                        "role": "system",
                        "content": "You are an experienced diagnostic physician. Provide thorough, evidence-based analysis with confidence scores reflecting clinical certainty. Always emphasize the importance of professional medical evaluation and prioritize patient safety."
                    }, {
                        "role": "user", 
                        "content": prompt
                    }],
                    temperature=0.2,
                    max_tokens=2000
                )
            
            response = self._make_openai_request_with_retry(make_request)
            content = self._clean_json_response(response.choices[0].message.content)
            diagnosis_data = json.loads(content)
            
            return diagnosis_data
            
        except Exception as e:
            print(f"Error in get_diagnosis_and_recommendations: {e}")
            return {
                "possible_conditions": [{
                    "condition": "Professional Medical Evaluation Required",
                    "confidence_score": 95,
                    "explanation": "Symptoms require comprehensive evaluation by a healthcare professional for accurate diagnosis"
                }],
                "diagnostic_tests": [{
                    "test": "Complete Medical Assessment",
                    "confidence_score": 100,
                    "priority": "Urgent",
                    "explanation": "Professional evaluation needed to determine appropriate diagnostic tests"
                }],
                "red_flags": ["Any worsening symptoms", "New concerning symptoms"],
                "immediate_care": ["Seek medical attention if symptoms worsen"],
                "follow_up": {
                    "urgency": "Urgent",
                    "timeline": "Within 24-48 hours",
                    "reason": "Professional evaluation needed for proper diagnosis"
                },
                "lifestyle": ["Follow medical advice"],
                "disclaimer": "This tool is not a substitute for professional medical advice, diagnosis, or treatment."
            }

    def _generate_individual_symptom_questions(self, symptoms: List[str], free_text: str) -> List[Dict]:
        """
        Generate exactly 3 detailed questions for each individual symptom to probe the nature,
        timing, patterns, and characteristics like an expert doctor would.
        """
        questions = []
        
        print(f"DEBUG: Processing {len(symptoms)} symptoms: {symptoms}")  # Debug log
        
        # Process each selected symptom with 3 targeted questions
        for i, symptom in enumerate(symptoms):
            # Clean symptom name (remove description in parentheses)
            clean_symptom = symptom.split('(')[0].strip()
            
            print(f"DEBUG: Processing symptom {i+1}/{len(symptoms)}: {clean_symptom}")  # Debug log
            
            # Question 1: Comprehensive Onset & Timing Analysis
            question1 = {
                'question': f'When did your {clean_symptom} first appear, and how has the timing pattern been?',
                'type': 'multiple_choice',
                'options': [
                    'Sudden onset - appeared within minutes',
                    'Gradual onset - developed over hours',
                    'Started days ago and persisting',
                    'Started weeks/months ago',
                    'Recurring episodes - comes and goes',
                    'Daily at specific times (morning/evening)',
                    'Triggered by specific activities',
                    'Constant since it started'
                ],
                'help_text': 'Understanding onset and timing patterns helps identify the underlying cause',
                'diagnostic_purpose': f'Analyze temporal characteristics and patterns of {clean_symptom}',
                'symptom_focus': clean_symptom,
                'question_category': 'onset_timing'
            }
            questions.append(question1)
            print(f"DEBUG: Added question 1 for {clean_symptom}")  # Debug log
            
            # Question 2: Intensity, Duration & Frequency
            if self._symptom_needs_intensity_rating(clean_symptom):
                question2 = {
                    'question': f'How would you describe the intensity and duration of your {clean_symptom} episodes?',
                    'type': 'multiple_choice',
                    'options': [
                        'Mild intensity - lasts few minutes',
                        'Mild intensity - lasts hours',
                        'Moderate intensity - brief episodes',
                        'Moderate intensity - lasts several hours',
                        'Severe intensity - short bursts',
                        'Severe intensity - prolonged episodes',
                        'Very severe - debilitating when present',
                        'Varies greatly in intensity and duration'
                    ],
                    'help_text': 'Intensity and duration patterns help assess severity and underlying pathology',
                    'diagnostic_purpose': f'Assess severity characteristics and episode duration of {clean_symptom}',
                    'symptom_focus': clean_symptom,
                    'question_category': 'intensity_duration'
                }
            else:
                # For non-intensity symptoms, focus on frequency and persistence
                question2 = {
                    'question': f'How often does your {clean_symptom} occur and how long does it typically last?',
                    'type': 'multiple_choice',
                    'options': [
                        'Constant and continuous',
                        'Several times daily',
                        'Once daily at regular times',
                        'Few times per week',
                        'Intermittent with no clear pattern',
                        'Only during specific activities',
                        'Mainly at night or morning',
                        'Triggered by certain situations'
                    ],
                    'help_text': 'Frequency patterns help identify triggers and underlying mechanisms',
                    'diagnostic_purpose': f'Determine frequency and persistence patterns of {clean_symptom}',
                    'symptom_focus': clean_symptom,
                    'question_category': 'frequency_pattern'
                }
            questions.append(question2)
            print(f"DEBUG: Added question 2 for {clean_symptom}")  # Debug log
            
            # Question 3: Characteristics, Triggers & Modifying Factors
            question3 = {
                'question': f'What specific characteristics, triggers, or factors affect your {clean_symptom}?',
                'type': 'textarea',
                'placeholder': f'Describe: What does the {clean_symptom} feel like? What makes it worse or better? Any specific triggers (food, stress, position, weather, etc.)? How does it affect your daily activities?',
                'help_text': 'Detailed characteristics and modifying factors are crucial for accurate diagnosis',
                'diagnostic_purpose': f'Identify quality, triggers, relieving factors, and functional impact of {clean_symptom}',
                'symptom_focus': clean_symptom,
                'question_category': 'characteristics_triggers'
            }
            questions.append(question3)
            print(f"DEBUG: Added question 3 for {clean_symptom}")  # Debug log
        
        # For free text symptoms, ask 3 comprehensive questions
        if free_text and free_text.strip():
            print(f"DEBUG: Processing free text symptoms: {free_text}")  # Debug log
            
            questions.append({
                'question': 'For the symptoms you described, when did they first appear and what is their timing pattern?',
                'type': 'multiple_choice',
                'options': [
                    'All started suddenly at the same time',
                    'Appeared gradually over days/weeks',
                    'Different symptoms started at different times',
                    'Symptoms come and go together',
                    'Some constant, others intermittent',
                    'Mainly occur at specific times of day',
                    'Triggered by specific situations',
                    'Present for months/years'
                ],
                'help_text': 'Timeline helps understand if symptoms are related or separate conditions',
                'diagnostic_purpose': 'Establish temporal relationship between patient-described symptoms',
                'symptom_focus': 'free_text_symptoms',
                'question_category': 'onset_timing'
            })
            
            questions.append({
                'question': 'How severe are your described symptoms and how do they impact your daily life?',
                'type': 'multiple_choice',
                'options': [
                    'Mild - barely noticeable, no impact on activities',
                    'Mild to moderate - some discomfort but manageable',
                    'Moderate - interferes with some daily activities',
                    'Moderate to severe - significant impact on work/life',
                    'Severe - greatly limits daily functioning',
                    'Very severe - unable to perform normal activities',
                    'Severity varies greatly throughout the day',
                    'Progressive worsening over time'
                ],
                'help_text': 'Severity and functional impact help prioritize treatment urgency',
                'diagnostic_purpose': 'Assess overall severity and functional impact of described symptoms',
                'symptom_focus': 'free_text_symptoms',
                'question_category': 'severity_impact'
            })
            
            questions.append({
                'question': 'What specific details can you provide about your symptoms - their character, what triggers them, and what provides relief?',
                'type': 'textarea',
                'placeholder': 'Please describe: Exact nature/quality of each symptom, any patterns you\'ve noticed, what makes them worse, what helps, any associated factors (stress, food, weather, position), medications tried, etc.',
                'help_text': 'Detailed symptom characteristics are essential for accurate diagnosis',
                'diagnostic_purpose': 'Gather comprehensive qualitative information about patient-described symptoms',
                'symptom_focus': 'free_text_symptoms',
                'question_category': 'detailed_characteristics'
            })
            
            print(f"DEBUG: Added 3 free text questions")  # Debug log
        
        print(f"DEBUG: Total questions generated: {len(questions)}")  # Debug log
        return questions

    def _symptom_needs_intensity_rating(self, symptom: str) -> bool:
        """
        Determine if a symptom requires intensity rating based on its nature.
        Certain symptoms like pain, discomfort, or fatigue typically require intensity assessment.
        """
        # Keywords indicating symptoms that usually have an intensity component
        intensity_keywords = ['pain', 'ache', 'hurt', 'discomfort', 'fatigue', 'tired', 'exhaustion', 'weakness']
        
        # Check if the symptom matches any of the intensity-related keywords
        return any(keyword in symptom.lower() for keyword in intensity_keywords)

    def _generate_dynamic_symptom_questions_openai(self, case_type: str, symptoms: List[str], free_text: str, demographics: Dict) -> List[Dict]:
        """
        Use OpenAI to dynamically generate a structured list of follow-up questions
        for the "Additional Information" section based on prior inputs.
        The output must be an array of objects with keys: symptom, category, notes_hint, type.
        """
        profile = {
            'case_type': case_type,
            'demographics': demographics or {},
            'symptoms': symptoms or [],
            'free_text': free_text or ''
        }

        categories = [
            "general", "gastrointestinal", "respiratory", "cardiovascular", "neurological",
            "musculoskeletal", "dermatological", "risk_factors", "history", "medications",
            "psychological", "temporal", "epidemiological", "physical", "pain", "throat"
        ]

        prompt = (
            "You are a medical intake assistant. Based on the patient profile, generate a structured "
            "checklist of follow-up items to ask in an intake form.\n\n"
            f"PATIENT PROFILE (JSON):\n{json.dumps(profile, ensure_ascii=False)}\n\n"
            "REQUIREMENTS:\n"
            "- Output ONLY valid JSON. No prose, no markdown.\n"
            "- JSON must be an array of 15-25 objects.\n"
            "- Each object must have: \n"
            "  {\n    \"symptom\": \"Short human-readable question/symptom probe\",\n"
            "    \"category\": \"one of: " + ", ".join(categories) + "\",\n"
            "    \"notes_hint\": \"Brief hint for notes input\",\n"
            "    \"type\": \"yes_no_notes\"\n  }\n"
            "- Questions must be tailored to the case type, selected symptoms, demographics, and free text.\n"
            "- Include temporal, risk factor, and red-flag probes when appropriate.\n"
            "- Keep 'symptom' field concise (max ~80 chars).\n"
        )

        def make_request():
            return self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You generate structured JSON checklists for medical intake forms."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,
                max_tokens=1200
            )

        response = self._make_openai_request_with_retry(make_request)
        content = self._clean_json_response(response.choices[0].message.content)

        try:
            payload = json.loads(content)
        except Exception as e:
            # Some models might wrap in an object
            try:
                alt = json.loads(content)
                payload = alt.get('questions', []) if isinstance(alt, dict) else []
            except Exception:
                raise ValueError(f"OpenAI returned non-JSON or invalid JSON: {str(e)}")

        # Normalize into expected structure
        items = payload.get('questions', payload) if isinstance(payload, dict) else payload
        if not isinstance(items, list):
            raise ValueError("OpenAI dynamic questions not a list")

        questions: List[Dict] = []
        seen = set()
        for raw in items:
            if not isinstance(raw, dict):
                continue
            symptom_text = str(raw.get('symptom') or raw.get('question') or '').strip()
            if not symptom_text:
                continue
            key = symptom_text.lower()
            if key in seen:
                continue
            seen.add(key)
            category = str(raw.get('category') or 'general').strip().lower()
            if category not in categories:
                category = 'general'
            notes_hint = str(raw.get('notes_hint') or raw.get('notes') or '').strip()
            questions.append({
                'symptom': symptom_text,
                'category': category,
                'notes_hint': notes_hint,
                'type': 'yes_no_notes'
            })

        return questions

    def extract_symptom_labels(self, symptoms: List[str], free_text: str = '') -> Dict:
        """
        Extract key symptom labels from user input and create a structured label system.
        Returns extracted labels with their features and correlations.
        """
        # Define primary symptom labels with their feature questions
        primary_labels = {
            'fever': {
                'keywords': ['fever', 'temperature', 'hot', 'burning up', 'feverish'],
                'features': [
                    "Did you check temperature with thermometer?",
                    "How many times has fever come in a day?", 
                    "Does fever come every day at least twice?",
                    "What is the highest temperature recorded?",
                    "Does fever respond to paracetamol/acetaminophen?"
                ]
            },
            'chills_shivering': {
                'keywords': ['chills', 'shivering', 'shaking', 'cold', 'trembling'],
                'features': [
                    "Do chills come along with fever?",
                    "Do you feel sweating after chills?",
                    "How long do chills episodes last?",
                    "Do chills happen at specific times?"
                ]
            },
            'sweating': {
                'keywords': ['sweating', 'perspiration', 'night sweats', 'profuse sweating'],
                'features': [
                    "Is sweating mainly at night?",
                    "Does sweating occur with fever?",
                    "Is sweating excessive even when cool?",
                    "Does sweating soak through clothes/bedding?"
                ]
            },
            'muscle_pain': {
                'keywords': ['muscle pain', 'body ache', 'myalgia', 'body pain', 'muscle ache'],
                'features': [
                    "Is muscle pain all over body or specific areas?",
                    "Does muscle pain worsen with movement?",
                    "Is pain constant or comes in waves?",
                    "Does pain respond to pain medication?"
                ]
            },
            'joint_pain': {
                'keywords': ['joint pain', 'arthralgia', 'knee pain', 'elbow pain', 'wrist pain'],
                'features': [
                    "Which joints are affected?",
                    "Is joint pain worse in morning or evening?",
                    "Any visible swelling in joints?",
                    "Does joint pain limit movement?"
                ]
            },
            'headache': {
                'keywords': ['headache', 'head pain', 'migraine', 'head ache'],
                'features': [
                    "Where exactly is headache located?",
                    "Is headache throbbing or constant pressure?",
                    "Does headache worsen with light/sound?",
                    "How severe is headache on scale 1-10?"
                ]
            },
            'weakness': {
                'keywords': ['weakness', 'fatigue', 'tired', 'exhaustion', 'weak', 'energy loss'],
                'features': [
                    "Is weakness generalized or specific body parts?",
                    "Does weakness interfere with daily activities?",
                    "Is weakness worse at certain times?",
                    "Any difficulty getting up from sitting/lying?"
                ]
            },
            'nausea_vomiting': {
                'keywords': ['nausea', 'vomiting', 'feeling sick', 'throwing up', 'sick feeling'],
                'features': [
                    "Does vomiting occur with or without eating?",
                    "How many times vomiting per day?",
                    "Is nausea constant or comes in waves?",
                    "What triggers the nausea/vomiting?"
                ]
            },
            'loss_of_appetite': {
                'keywords': ['loss of appetite', 'no appetite', 'not hungry', 'food aversion'],
                'features': [
                    "Complete loss of appetite or reduced?",
                    "Any specific foods you can tolerate?",
                    "How much weight loss if any?",
                    "When did appetite loss start?"
                ]
            }
        }
        
        # Extract labels present in symptoms
        extracted_labels = {}
        all_text = ' '.join(symptoms).lower() + ' ' + free_text.lower()
        
        for label, data in primary_labels.items():
            if any(keyword in all_text for keyword in data['keywords']):
                extracted_labels[label] = {
                    'detected': True,
                    'features': data['features'],
                    'source': 'symptoms' if any(keyword in ' '.join(symptoms).lower() for keyword in data['keywords']) else 'free_text'
                }
        
        return {
            'extracted_labels': extracted_labels,
            'label_count': len(extracted_labels),
            'correlation_matrix': self._create_label_correlation_matrix(extracted_labels),
            'feature_questions': self._generate_label_feature_questions(extracted_labels)
        }

    def _create_label_correlation_matrix(self, extracted_labels: Dict) -> Dict:
        """
        Create a correlation matrix showing relationships between detected labels.
        """
        # Define correlation rules between symptoms
        correlation_rules = {
            'fever': {
                'highly_correlated': ['chills_shivering', 'sweating', 'weakness', 'muscle_pain', 'headache'],
                'moderately_correlated': ['nausea_vomiting', 'loss_of_appetite'],
                'correlation_questions': [
                    "Does fever occur together with chills/shivering?",
                    "Do you experience sweating when fever breaks?",
                    "Is body ache/muscle pain present with fever?"
                ]
            },
            'chills_shivering': {
                'highly_correlated': ['fever', 'sweating'],
                'moderately_correlated': ['weakness', 'muscle_pain'],
                'correlation_questions': [
                    "Do chills always come with fever?",
                    "Does sweating follow after chills episode?",
                    "Do you feel weak during chills?"
                ]
            },
            'nausea_vomiting': {
                'highly_correlated': ['loss_of_appetite', 'weakness'],
                'moderately_correlated': ['fever', 'headache'],
                'correlation_questions': [
                    "Did loss of appetite start with nausea?",
                    "Does vomiting worsen weakness?",
                    "Is nausea worse with fever episodes?"
                ]
            }
        }
        
        matrix = {}
        detected_labels = list(extracted_labels.keys())
        
        for label in detected_labels:
            if label in correlation_rules:
                correlations = []
                for corr_label in correlation_rules[label]['highly_correlated']:
                    if corr_label in detected_labels:
                        correlations.append({
                            'label': corr_label,
                            'strength': 'high',
                            'questions': correlation_rules[label]['correlation_questions']
                        })
                
                for corr_label in correlation_rules[label]['moderately_correlated']:
                    if corr_label in detected_labels:
                        correlations.append({
                            'label': corr_label,
                            'strength': 'moderate',
                            'questions': correlation_rules[label]['correlation_questions']
                        })
                
                matrix[label] = correlations
        
        return matrix

    def _generate_label_feature_questions(self, extracted_labels: Dict) -> List[Dict]:
        """
        Generate specific feature questions for each extracted label.
        """
        questions = []
        
        for label, data in extracted_labels.items():
            for feature_question in data['features']:
                questions.append({
                    'symptom': feature_question,
                    'category': 'label_features',
                    'notes_hint': f'Details about {label.replace("_", " ")}',
                    'type': 'yes_no_notes',
                    'label': label,
                    'question_type': 'feature_extraction'
                })
        
        return questions

    def _generate_enhanced_structured_questions(self, case_type: str, symptoms: List[str], free_text: str, demographics: Dict) -> List[Dict]:
        """
        Enhanced version that includes label extraction and correlation-based questions.
        """
        # Extract symptom labels first
        label_data = self.extract_symptom_labels(symptoms, free_text)
        
        # Start with label feature questions
        questions = label_data['feature_questions']
        
        # Add correlation questions
        for label, correlations in label_data['correlation_matrix'].items():
            for correlation in correlations:
                for question in correlation['questions']:
                    questions.append({
                        'symptom': question,
                        'category': 'correlation',
                        'notes_hint': f'Relationship between {label.replace("_", " ")} and {correlation["label"].replace("_", " ")}',
                        'type': 'yes_no_notes',
                        'correlation_strength': correlation['strength'],
                        'question_type': 'correlation_analysis'
                    })
        
        # Add base questions from original method
        base_questions = self._generate_structured_symptom_questions(case_type, symptoms, free_text, demographics)
        
        # Combine and remove duplicates
        all_questions = questions + base_questions
        seen_symptoms = set()
        final_questions = []
        
        for q in all_questions:
            symptom_key = q["symptom"].lower()
            if symptom_key not in seen_symptoms:
                seen_symptoms.add(symptom_key)
                final_questions.append(q)
        
        return final_questions

    def get_next_followup_question(self, data: Dict) -> Dict:
        """
        Serve the next question in the legacy one-by-one interview flow.
        Uses cached state to step through questions generated per selected symptoms
        and free-text. Returns { question, completed }.
        """
        # Initialize the question list if empty
        if not self.symptom_analysis_state.get('individual_questions'):
            # Pull inputs from payload
            symptoms = data.get('symptoms') or []
            free_text = data.get('freeTextSymptoms') or data.get('free_text') or ''

            # Generate questions (3 per symptom + 3 for free text if present)
            questions = self._generate_individual_symptom_questions(symptoms, free_text)

            self.symptom_analysis_state['individual_questions'] = questions
            self.symptom_analysis_state['individual_index'] = 0

        # Fetch current index and questions
        idx = self.symptom_analysis_state.get('individual_index', 0)
        questions = self.symptom_analysis_state.get('individual_questions', [])

        # If we've asked all questions, mark completed
        if idx >= len(questions):
            return { 'completed': True }

        # Get the next question and advance the index
        next_q = questions[idx]
        self.symptom_analysis_state['individual_index'] = idx + 1

        # Indicate if this is the final question
        is_final = (self.symptom_analysis_state['individual_index'] >= len(questions))

        return {
            'question': next_q,
            'completed': False,
            'final_question': is_final
        }

    def extract_symptom_labels_with_openai(self, symptoms: List[str], free_text: str = '') -> Dict:
        """
        Use OpenAI to extract symptom labels from user input instead of keyword matching.
        Returns extracted labels with their correlations.
        """
        # Combine all symptom text
        all_symptom_text = ' '.join(symptoms) + ' ' + free_text
        
        if not all_symptom_text.strip():
            return {
                'extracted_labels': {},
                'label_count': 0,
                'correlation_matrix': {},
                'feature_questions': []
            }

        prompt = f"""You are a medical AI assistant. Analyze the following symptom description and extract key medical symptom labels.

SYMPTOM INPUT: "{all_symptom_text}"

Extract specific medical symptom labels from this text. Focus on identifying distinct, clinically relevant symptom categories.

Return your analysis in this EXACT JSON format:
{{
    "extracted_labels": {{
        "label_name": {{
            "detected": true,
            "source": "symptoms" or "free_text",
            "confidence": "high" or "medium" or "low"
        }}
    }},
    "correlation_matrix": {{
        "label_name": [
            {{
                "label": "related_label_name",
                "strength": "high" or "moderate",
                "questions": [
                    "Specific correlation question 1",
                    "Specific correlation question 2"
                ]
            }}
        ]
    }}
}}

GUIDELINES:
- Extract 3-8 specific medical symptom labels
- Use standard medical terminology 
- Correlations should be medically accurate
- Questions should be clinically relevant
- Focus on primary symptoms mentioned
- Avoid generic terms like "general symptoms"

Example labels: fever, headache, nausea, muscle_pain, fatigue, abdominal_pain, respiratory_symptoms, etc."""

        try:
            def make_request():
                return self.client.chat.completions.create(
                    model=self.model,
                    messages=[{
                        "role": "system",
                        "content": "You are a medical AI specialized in symptom analysis and label extraction. Provide accurate, clinically relevant symptom labels and their relationships."
                    }, {
                        "role": "user",
                        "content": prompt
                    }],
                    temperature=0.2,
                    max_tokens=1500
                )
            
            response = self._make_openai_request_with_retry(make_request)
            content = self._clean_json_response(response.choices[0].message.content)
            result = json.loads(content)
            
            # Validate and ensure proper response format
            if 'extracted_labels' not in result:
                result['extracted_labels'] = {}
            if 'correlation_matrix' not in result:
                result['correlation_matrix'] = {}
            
            # Add label count
            result['label_count'] = len(result['extracted_labels'])
            result['feature_questions'] = []  # Not used in simplified version
            
            return result
            
        except Exception as e:
            print(f"Error in extract_symptom_labels_with_openai: {e}")
            return {
                'extracted_labels': {},
                'label_count': 0,
                'correlation_matrix': {},
                'feature_questions': []
            }
    
    def generate_additional_questions(self, patient_data: Dict, max_questions: int = 20) -> List[Dict]:
        """
        Generate dynamic OLDCARTS framework questions based on the patient's data.
        The questions focus on:
        - Onset: When the symptoms started
        - Duration: How long the symptoms have lasted
        - Characteristics: Description of symptoms (severity, quality, location)
        - Aggravating Factors: What makes symptoms worse
        - Relieving Factors: What makes symptoms better
        - Pain: Specific pain assessment
        - Nausea/Vomiting: Assessment of these symptoms if relevant
        - Fatigue: Level of fatigue and impact on daily activities
        - Impact on Daily Life: Work/school performance, daily activities
        - Patient's Concerns and Expectations
        
        Args:
            patient_data (dict): The patient's demographic, symptom, and vitals data
            max_questions (int): Maximum number of questions to generate
        
        Returns:
            list: A list of question objects with type, text, and options
        """
        try:
            # Extract relevant information from patient data
            symptoms = patient_data.get('symptoms', [])
            free_text_symptoms = patient_data.get('freeTextSymptoms', '')
            demographics = patient_data.get('demographics', {})
            vitals = patient_data.get('vitals', {})
            medical_conditions = patient_data.get('medicalConditions', {})
            case_type = patient_data.get('caseType', '')
            
            # Construct prompt for OpenAI
            system_message = """You are a medical expert specializing in patient assessment. 
            Your task is to generate targeted additional information questions based on the OLDCARTS framework
            (Onset, Location, Duration, Characteristics, Aggravating factors, Relieving factors, Timing, Severity)
            tailored to the patient's specific symptoms, demographics, and clinical measurements.
            
            Create questions that are directly relevant to the reported symptoms and will help in accurate diagnosis.
            Each question should have a clear clinical purpose and be formatted as a JSON object with:
            - id: A unique numerical identifier
            - category: The OLDCARTS category (onset_timing, location, duration_pattern, characteristics_quality, aggravating_factors, relieving_factors, pain_assessment, nausea_vomiting, fatigue_impact, daily_life_impact, work_school_impact, patient_concerns, patient_expectations)
            - question: The actual question text
            - type: Question type (multiple_choice, textarea, scale)
            - options: For multiple_choice questions, an array of possible answers
            - min/max/min_label/max_label: For scale questions
            - relevance: A short explanation of why this question is clinically relevant
            - placeholder: For textarea questions, a hint for the answer
            
            Prioritize questions that:
            1. Address the timing and nature of the primary symptoms
            2. Explore potential complications or differential diagnoses
            3. Assess severity and impact on the patient's life
            4. Help distinguish between similar conditions
            
            Make sure questions are medically accurate and use appropriate medical terminology while still being understandable to patients.
            """
            
            # Construct context message with patient information
            context_message = f"""
            Generate additional information questions for a {demographics.get('age', '')} year old {demographics.get('gender', '')} 
            with the following reported symptoms: {', '.join(symptoms)}
            
            Additional symptom details: {free_text_symptoms}
            
            Case type: {case_type}
            
            Vital signs:
            """
            
            # Add vitals if available
            if vitals:
                if 'temperature' in vitals:
                    context_message += f"- Temperature: {vitals.get('temperature')} {vitals.get('temperatureUnit', 'C')}\n"
                if 'pulseRate' in vitals:
                    context_message += f"- Pulse rate: {vitals.get('pulseRate')} bpm\n"
                if 'systolic' in vitals and 'diastolic' in vitals:
                    context_message += f"- Blood pressure: {vitals.get('systolic')}/{vitals.get('diastolic')} mmHg\n"
                if 'oxygenSaturation' in vitals:
                    context_message += f"- Oxygen saturation: {vitals.get('oxygenSaturation')}%\n"
                if 'respiratoryRate' in vitals:
                    context_message += f"- Respiratory rate: {vitals.get('respiratoryRate')} breaths/min\n"
                if 'painScale' in vitals:
                    context_message += f"- Pain level: {vitals.get('painScale')}/10\n"
            
            # Add medical conditions if available
            if medical_conditions:
                context_message += "\nMedical conditions:\n"
                for condition, value in medical_conditions.items():
                    context_message += f"- {condition}: {value}\n"
            
            user_message = f"""
            Based on the patient information provided, generate a maximum of {max_questions} clinically relevant additional information questions 
            using the OLDCARTS framework. Focus on questions that would help determine the diagnosis and severity of the patient's condition.
            
            Return the questions in a valid JSON array format that I can parse programmatically. Each question should be directly relevant 
            to the symptoms and medical context provided. Don't invent new symptoms that weren't mentioned.
            
            Here's an example of the desired output format:
            ```json
            [
              {{
                "id": 1,
                "category": "onset_timing",
                "question": "When did your fever first begin?",
                "type": "multiple_choice",
                "options": ["Within the last 24 hours", "1-3 days ago", "4-7 days ago", "More than a week ago"],
                "relevance": "Helps determine if this is an acute or chronic condition"
              }},
              {{
                "id": 2,
                "category": "pain_assessment",
                "question": "How would you rate your abdominal pain?",
                "type": "scale",
                "min": 0,
                "max": 10,
                "min_label": "No pain",
                "max_label": "Worst possible pain",
                "relevance": "Pain severity helps assess condition urgency"
              }}
            ]
            ```
            """

            # Use retry wrapper for OpenAI API call with the same model as other features
            def make_request():
                return self.client.chat.completions.create(
                    model=self.model,  # Use the model defined in the class instead of hard-coded "gpt-4"
                    messages=[
                        {"role": "system", "content": system_message},
                        {"role": "user", "content": context_message},
                        {"role": "user", "content": user_message}
                    ],
                    temperature=0.7,
                    max_tokens=2048
                )
            
            response = self._make_openai_request_with_retry(make_request)
            response_text = response.choices[0].message.content
            
            # Extract JSON from response
            import re
            import json
            
            # Find JSON array in the response
            json_match = re.search(r'```json\s*([\s\S]*?)\s*```|(\[[\s\S]*\])', response_text)
            
            if json_match:
                json_str = json_match.group(1) or json_match.group(2)
                questions = json.loads(json_str)
                return questions
            else:
                # If no proper JSON found, attempt to parse the entire response
                try:
                    questions = json.loads(response_text)
                    return questions
                except:
                    print("Could not parse JSON from response, using fallback questions")
                    return []
                
        except Exception as e:
            print(f"Error generating additional information questions: {e}")
            return []
    
    def generate_patient_summary_with_do_indicators(self, patient_data: Dict) -> Dict:
        """
        Generate a comprehensive patient summary with D/O (Diagnostic/Objective) indicators
        and analyze clinical vitals for abnormalities.
        """
        # Extract patient information
        demographics = patient_data.get('demographics', {})
        medical_conditions = patient_data.get('medicalConditions', {})
        medical_history = patient_data.get('medicalHistory', {})
        lifestyle = patient_data.get('lifestyle', {})
        medical_records = patient_data.get('medicalRecords', {})
        vitals = patient_data.get('vitals', {})
        case_type = patient_data.get('caseType', '')

        # Create comprehensive prompt for patient summary with D/O indicators
        prompt = f"""You are a medical AI assistant generating a comprehensive patient history summary with Diagnostic (D) and Objective (O) indicators.

PATIENT DATA:
Demographics: {json.dumps(demographics)}
Medical Conditions: {json.dumps(medical_conditions)}
Medical History: {json.dumps(medical_history)}
Lifestyle: {json.dumps(lifestyle)}
Medical Records: {json.dumps(medical_records)}
Clinical Vitals: {json.dumps(vitals)}
Case Type: {case_type}

TASK: Generate a structured patient summary with D/O indicators for medical documentation.

INSTRUCTIONS:
1. Use (D) for Diagnostic indicators - information that helps diagnose conditions
2. Use (O) for Objective indicators - measurable, observable findings
3. Highlight risk factors, abnormalities, and clinical significance
4. Provide insights for medical decision-making
5. Format as HTML for web display

Generate response in this EXACT JSON format:
{{
    "patient_summary": {{
        "demographics_summary": "HTML formatted demographics with D/O indicators",
        "medical_history_summary": "HTML formatted medical history with D/O indicators", 
        "risk_factors_summary": "HTML formatted risk factors with D/O indicators",
        "clinical_relevance": "HTML formatted clinical relevance assessment"
    }},
    "vitals_abnormalities": {{
        "critical_abnormalities": ["List of critical findings requiring immediate attention"],
        "moderate_abnormalities": ["List of moderate abnormalities requiring monitoring"],
        "mild_abnormalities": ["List of mild abnormalities to note"],
        "normal_findings": ["List of normal vital signs"]
    }},
    "medical_significance": {{
        "diagnostic_indicators": "HTML analysis of diagnostic indicators (D)",
        "objective_findings": "HTML analysis of objective findings (O)",
        "clinical_correlations": "HTML analysis of clinical correlations",
        "next_steps": "HTML recommendations for next steps"
    }}
}}

Focus on:
- Age/gender risk factors
- Chronic disease implications
- Lifestyle/occupational risks
- Medication interactions
- Family history significance
- Vital signs abnormalities
- Clinical decision support"""

        try:
            def make_request():
                return self.client.chat.completions.create(
                    model=self.model,
                    messages=[{
                        "role": "system",
                        "content": "You are a medical AI assistant specializing in patient history summarization with D/O indicators and clinical vitals analysis. Provide comprehensive, structured medical summaries."
                    }, {
                        "role": "user",
                        "content": prompt
                    }],
                    temperature=0.2,
                    max_tokens=2000
                )
            
            response = self._make_openai_request_with_retry(make_request)
            content = self._clean_json_response(response.choices[0].message.content)
            result = json.loads(content)
            
            # Validate response structure
            if 'patient_summary' not in result:
                result['patient_summary'] = self._generate_fallback_patient_summary(patient_data)
            if 'vitals_abnormalities' not in result:
                result['vitals_abnormalities'] = self._analyze_vitals_abnormalities(vitals)
            if 'medical_significance' not in result:
                result['medical_significance'] = self._generate_medical_significance(patient_data)
            
            return result
            
        except Exception as e:
            print(f"Error generating patient summary: {e}")
            return {
                'patient_summary': self._generate_fallback_patient_summary(patient_data),
                'vitals_abnormalities': self._analyze_vitals_abnormalities(vitals),
                'medical_significance': self._generate_medical_significance(patient_data)
            }

    def _generate_fallback_patient_summary(self, patient_data: Dict) -> Dict:
        """Generate a basic patient summary when AI generation fails"""
        demographics = patient_data.get('demographics', {})
        medical_conditions = patient_data.get('medicalConditions', {})
        
        demographics_html = "<p><strong>Patient Demographics:</strong></p><ul>"
        if demographics.get('age'):
            demographics_html += f"<li><strong>Age (O):</strong> {demographics['age']} years - "
            if int(demographics['age']) > 65:
                demographics_html += "<em>Geriatric patient, increased complication risk</em></li>"
            elif int(demographics['age']) < 18:
                demographics_html += "<em>Pediatric patient, specialized care considerations</em></li>"
            else:
                demographics_html += "<em>Adult patient</em></li>"
        
        if demographics.get('gender'):
            demographics_html += f"<li><strong>Gender (O):</strong> {demographics['gender'].title()}</li>"
        
        demographics_html += "</ul>"
        
        medical_history_html = "<p><strong>Medical Conditions:</strong></p><ul>"
        if medical_conditions.get('diabetic') == 'yes':
            medical_history_html += "<li><strong>Diabetes (D):</strong> Present - Increased infection risk, wound healing complications</li>"
        if medical_conditions.get('hypertension') == 'yes':
            medical_history_html += "<li><strong>Hypertension (D):</strong> Present - Cardiovascular risk factor</li>"
        medical_history_html += "</ul>"
        
        return {
            'demographics_summary': demographics_html,
            'medical_history_summary': medical_history_html,
            'risk_factors_summary': "<p>Basic risk assessment - comprehensive analysis requires AI processing</p>",
            'clinical_relevance': "<p>Clinical significance analysis requires AI processing for comprehensive assessment</p>"
        }

    def _analyze_vitals_abnormalities(self, vitals: Dict) -> Dict:
        """Analyze vital signs for abnormalities"""
        critical = []
        moderate = []
        mild = []
        normal = []
        
        # Blood pressure analysis
        if vitals.get('systolic') and vitals.get('diastolic'):
            systolic = int(vitals['systolic'])
            diastolic = int(vitals['diastolic'])
            
            if systolic >= 180 or diastolic >= 120:
                critical.append(f"Hypertensive Crisis: BP {systolic}/{diastolic} mmHg - Immediate medical attention required")
            elif systolic >= 140 or diastolic >= 90:
                moderate.append(f"Hypertension: BP {systolic}/{diastolic} mmHg - Cardiovascular risk, medication review needed")
            elif systolic < 90 or diastolic < 60:
                moderate.append(f"Hypotension: BP {systolic}/{diastolic} mmHg - Risk of organ hypoperfusion")
            else:
                normal.append(f"Blood Pressure: {systolic}/{diastolic} mmHg - Normal range")
        
        # Temperature analysis
        if vitals.get('temperature'):
            temp = float(vitals['temperature'])
            unit = vitals.get('temperatureUnit', 'F')
            
            if unit == 'F':
                if temp >= 103:
                    critical.append(f"High Fever: {temp}°F - Risk of febrile seizures, dehydration")
                elif temp >= 100.4:
                    mild.append(f"Fever: {temp}°F - Indicates infection or inflammatory process")
                elif temp < 96:
                    moderate.append(f"Hypothermia: {temp}°F - May indicate sepsis or exposure")
                else:
                    normal.append(f"Temperature: {temp}°F - Normal range")
        
        # Oxygen saturation analysis
        if vitals.get('oxygenSaturation'):
            spo2 = int(vitals['oxygenSaturation'])
            
            if spo2 < 90:
                critical.append(f"Severe Hypoxemia: SpO2 {spo2}% - Respiratory failure, requires immediate oxygen")
            elif spo2 < 95:
                moderate.append(f"Mild Hypoxemia: SpO2 {spo2}% - Monitor respiratory status")
            else:
                normal.append(f"Oxygen Saturation: {spo2}% - Normal oxygenation")
        
        # Heart rate analysis
        if vitals.get('pulseRate'):
            pulse = int(vitals['pulseRate'])
            
            if pulse < 50:
                moderate.append(f"Bradycardia: {pulse} BPM - Consider cardiac conditions, medications")
            elif pulse > 120:
                moderate.append(f"Tachycardia: {pulse} BPM - May indicate fever, dehydration, cardiac issues")
            else:
                normal.append(f"Pulse Rate: {pulse} BPM - Normal range")
        
        # Blood sugar analysis
        if vitals.get('bloodSugar'):
            glucose = int(vitals['bloodSugar'])
            
            if glucose >= 300:
                critical.append(f"Severe Hyperglycemia: {glucose} mg/dL - Diabetic emergency risk")
            elif glucose >= 200:
                moderate.append(f"Hyperglycemia: {glucose} mg/dL - Diabetic crisis risk")
            elif glucose < 70:
                moderate.append(f"Hypoglycemia: {glucose} mg/dL - Risk of altered mental status")
            else:
                normal.append(f"Blood Sugar: {glucose} mg/dL - Normal range")
        
        return {
            'critical_abnormalities': critical,
            'moderate_abnormalities': moderate,
            'mild_abnormalities': mild,
            'normal_findings': normal
        }

    def _generate_medical_significance(self, patient_data: Dict) -> Dict:
        """Generate medical significance analysis"""
        return {
            'diagnostic_indicators': "<p><strong>Diagnostic Indicators (D):</strong> Patient demographics, medical history, and presenting symptoms provide diagnostic context for clinical evaluation.</p>",
            'objective_findings': "<p><strong>Objective Findings (O):</strong> Vital signs, physical measurements, and documented medical conditions represent measurable clinical data.</p>",
            'clinical_correlations': "<p><strong>Clinical Correlations:</strong> Integration of patient history, risk factors, and current clinical status guides differential diagnosis.</p>",
            'next_steps': "<p><strong>Recommended Next Steps:</strong> Continue with symptom assessment and clinical evaluation based on collected patient information.</p>"
        }

    def generate_followup_questions_with_do_indicators(self, patient_data: Dict) -> Dict:
        """
        Generate dynamic follow-up questions based on patient information with D/O indicators
        and outliers in clinical vitals using OpenAI.
        """
        # Extract patient information
        demographics = patient_data.get('demographics', {})
        medical_conditions = patient_data.get('medicalConditions', {})
        medical_history = patient_data.get('medicalHistory', {})
        lifestyle = patient_data.get('lifestyle', {})
        medical_records = patient_data.get('medicalRecords', {})
        vitals = patient_data.get('vitals', {})
        case_type = patient_data.get('caseType', '')

        # Analyze vitals for outliers
        vitals_outliers = self._analyze_vitals_outliers(vitals)
        
        # Create comprehensive prompt for question generation
        prompt = f"""You are a medical AI assistant generating targeted follow-up questions based on patient information with D/O (Diagnostic/Objective) indicators and clinical vitals outliers.

PATIENT DATA:
Demographics: {json.dumps(demographics)}
Medical Conditions: {json.dumps(medical_conditions)}
Medical History: {json.dumps(medical_history)}

Lifestyle: {json.dumps(lifestyle)}
Medical Records: {json.dumps(medical_records)}
Clinical Vitals: {json.dumps(vitals)}
Case Type: {case_type}

VITALS OUTLIERS DETECTED:
{json.dumps(vitals_outliers)}

TASK: Generate 8-12 targeted follow-up questions based on:
1. Patient demographics with D/O indicators (age, gender, occupation, medical history)
2. Clinical vitals outliers requiring further assessment
3. Medical conditions that need clarification
4. Risk factors identified from patient information

QUESTION GENERATION GUIDELINES:
- Focus on D (Diagnostic) indicators: Information that helps diagnose conditions
- Focus on O (Objective) indicators: Measurable, observable findings
- Address any critical vitals outliers first
- Include age-appropriate questions
- Consider gender-specific health concerns
- Ask about symptom onset, duration, and severity
- Investigate family history implications
- Assess functional impact and quality of life

Generate response in this EXACT JSON format:
{{
    "questions": [
        {{
            "id": 1,
            "category": "vitals_outlier" | "demographics" | "medical_history" | "symptoms" | "risk_factors" | "functional_assessment",
            "question": "Clear, specific question text",
            "type": "multiple_choice" | "textarea" | "scale",
            "options": ["option1", "option2", "option3", "option4"] (only for multiple_choice),
            "min": 1, "max": 10, "min_label": "No pain", "max_label": "Severe pain" (only for scale),
            "placeholder": "Enter details..." (only for textarea),
            "relevance": "Medical relevance and D/O indicator explanation",
            "priority": "high" | "medium" | "low"
        }}
    ],
    "total_questions": 10,
    "outliers_addressed": ["list of vitals outliers being addressed"],
    "do_indicators_focus": ["list of key D/O indicators being assessed"]
}}

EXAMPLES OF GOOD QUESTIONS:
- "You have elevated blood pressure (142/88). Have you experienced headaches or dizziness recently?" (O indicator)
- "Given your age of 68 and diabetes history, do you check your blood sugar regularly?" (D indicator)
- "Your temperature is 99.2°F. When did you first notice feeling warm or feverish?" (O indicator)
- "As a female patient, are you currently taking any hormonal medications?" (D indicator)

Focus on actionable medical information that will help with diagnosis and treatment planning."""

        try:
            def make_request():
                return self.client.chat.completions.create(
                    model=self.model,
                    messages=[{
                        "role": "system",
                        "content": "You are a medical AI assistant specializing in generating targeted follow-up questions based on patient data and clinical findings. Generate questions that help gather diagnostic and objective information."
                    }, {
                        "role": "user",
                        "content": prompt
                    }],
                    temperature=0.3,
                    max_tokens=2000
                )
            
            response = self._make_openai_request_with_retry(make_request)
            content = self._clean_json_response(response.choices[0].message.content)
            result = json.loads(content)
            
            # Validate response structure
            if 'questions' not in result or not isinstance(result['questions'], list):
                result = self._generate_fallback_followup_questions(patient_data, vitals_outliers)
            
            # Ensure we have reasonable number of questions
            if len(result['questions']) < 3:
                fallback = self._generate_fallback_followup_questions(patient_data, vitals_outliers)
                result['questions'].extend(fallback['questions'][:5])
            
            return result
            
        except Exception as e:
            print(f"Error generating followup questions: {e}")
            return self._generate_fallback_followup_questions(patient_data, vitals_outliers)

    def _analyze_vitals_outliers(self, vitals: Dict) -> Dict:
        """Analyze vital signs to identify outliers requiring follow-up questions"""
        outliers = {
            'critical': [],
            'moderate': [],
            'mild': []
        }
        
        # Blood pressure analysis
        if vitals.get('systolic') and vitals.get('diastolic'):
            systolic = int(vitals['systolic'])
            diastolic = int(vitals['diastolic'])
            
            if systolic >= 180 or diastolic >= 120:
                outliers['critical'].append({
                    'type': 'hypertensive_crisis',
                    'values': f"{systolic}/{diastolic} mmHg",
                    'concern': 'Immediate medical attention required'
                })
            elif systolic >= 140 or diastolic >= 90:
                outliers['moderate'].append({
                    'type': 'hypertension',
                    'values': f"{systolic}/{diastolic} mmHg",
                    'concern': 'Elevated blood pressure requiring assessment'
                })
            elif systolic < 90 or diastolic < 60:
                outliers['moderate'].append({
                    'type': 'hypotension',
                    'values': f"{systolic}/{diastolic} mmHg",
                    'concern': 'Low blood pressure requiring evaluation'
                })
        
        # Temperature analysis
        if vitals.get('temperature'):
            temp = float(vitals['temperature'])
            unit = vitals.get('temperatureUnit', 'F')
            
            if unit == 'F':
                if temp >= 103:
                    outliers['critical'].append({
                        'type': 'high_fever',
                        'values': f"{temp}°F",
                        'concern': 'High fever requiring immediate attention'
                    })
                elif temp >= 100.4:
                    outliers['moderate'].append({
                        'type': 'fever',
                        'values': f"{temp}°F",
                        'concern': 'Fever indicating possible infection'
                    })
                elif temp < 96:
                    outliers['moderate'].append({
                        'type': 'hypothermia',
                        'values': f"{temp}°F",
                        'concern': 'Low temperature requiring assessment'
                    })
            else:  # Celsius
                if temp >= 39.4:
                    outliers['critical'].append({
                        'type': 'high_fever',
                        'values': f"{temp}°C",
                        'concern': 'High fever requiring immediate attention'
                    })
                elif temp >= 38:
                    outliers['moderate'].append({
                        'type': 'fever',
                        'values': f"{temp}°C",
                        'concern': 'Fever indicating possible infection'
                    })
                elif temp < 35.5:
                    outliers['moderate'].append({
                        'type': 'hypothermia',
                        'values': f"{temp}°C",
                        'concern': 'Low temperature requiring assessment'
                    })
        
        # Heart rate analysis
        if vitals.get('pulseRate'):
            pulse = int(vitals['pulseRate'])
            
            if pulse < 50:
                outliers['moderate'].append({
                    'type': 'bradycardia',
                    'values': f"{pulse} BPM",
                    'concern': 'Slow heart rate requiring evaluation'
                })
            elif pulse > 120:
                outliers['moderate'].append({
                    'type': 'tachycardia',
                    'values': f"{pulse} BPM",
                    'concern': 'Fast heart rate requiring assessment'
                })
        
        # Oxygen saturation analysis
        if vitals.get('oxygenSaturation'):
            spo2 = int(vitals['oxygenSaturation'])
            
            if spo2 < 90:
                outliers['critical'].append({
                    'type': 'severe_hypoxemia',
                    'values': f"{spo2}%",
                    'concern': 'Dangerously low oxygen levels'
                })
            elif spo2 < 95:
                outliers['moderate'].append({
                    'type': 'mild_hypoxemia',
                    'values': f"{spo2}%",
                    'concern': 'Low oxygen saturation requiring monitoring'
                })
        
        # Blood sugar analysis
        if vitals.get('bloodSugar'):
            glucose = int(vitals['bloodSugar'])
            
            if glucose >= 300:
                outliers['critical'].append({
                    'type': 'severe_hyperglycemia',
                    'values': f"{glucose} mg/dL",
                    'concern': 'Extremely high blood sugar - diabetic emergency risk'
                })
            elif glucose >= 200:
                outliers['moderate'].append({
                    'type': 'hyperglycemia',
                    'values': f"{glucose} mg/dL",
                    'concern': 'High blood sugar requiring assessment'
                })
            elif glucose < 70:
                outliers['moderate'].append({
                    'type': 'hypoglycemia',
                    'values': f"{glucose} mg/dL",
                    'concern': 'Low blood sugar requiring immediate attention'
                })
        
        # Pain scale analysis
        if vitals.get('painScale'):
            pain = int(vitals['painScale'])
            
            if pain >= 7:
                outliers['moderate'].append({
                    'type': 'severe_pain',
                    'values': f"{pain}/10",
                    'concern': 'Severe pain requiring management'
                })
            elif pain >= 4:
                outliers['mild'].append({
                    'type': 'moderate_pain',
                    'values': f"{pain}/10",
                    'concern': 'Moderate pain affecting function'
                })
        
        return outliers

    def _generate_fallback_followup_questions(self, patient_data: Dict, vitals_outliers: Dict) -> Dict:
        """Generate fallback questions when AI generation fails"""
        questions = []
        question_id = 1
        
        # Address critical vitals outliers first
        for outlier in vitals_outliers.get('critical', []):
            if outlier['type'] == 'hypertensive_crisis':
                questions.append({
                    "id": question_id,
                    "category": "vitals_outlier",
                    "question": f"Your blood pressure is critically high ({outlier['values']}). Are you experiencing severe headaches, chest pain, or difficulty breathing?",
                    "type": "multiple_choice",
                    "options": ["No symptoms", "Mild headache", "Severe headache", "Chest pain", "Difficulty breathing"],
                    "relevance": "Critical hypertension assessment - immediate medical evaluation needed",
                    "priority": "high"
                })
                question_id += 1
            elif outlier['type'] == 'high_fever':
                questions.append({
                    "id": question_id,
                    "category": "vitals_outlier",
                    "question": f"You have a high fever ({outlier['values']}). How long have you had this fever?",
                    "type": "multiple_choice",
                    "options": ["Less than 6 hours", "6-12 hours", "1-2 days", "More than 2 days"],
                    "relevance": "High fever duration assessment for infection severity",
                    "priority": "high"
                })
                question_id += 1
        
        # Address moderate outliers
        for outlier in vitals_outliers.get('moderate', []):
            if outlier['type'] == 'fever' and question_id <= 8:
                questions.append({
                    "id": question_id,
                    "category": "vitals_outlier",
                    "question": f"You have a fever ({outlier['values']}). Have you taken any fever-reducing medications?",
                    "type": "multiple_choice",
                    "options": ["No medications taken", "Acetaminophen/Tylenol", "Ibuprofen/Advil", "Other pain relievers"],
                    "relevance": "Fever management assessment for treatment planning",
                    "priority": "medium"
                })
                question_id += 1
            elif outlier['type'] == 'tachycardia' and question_id <= 8:
                questions.append({
                    "id": question_id,
                    "category": "vitals_outlier",
                    "question": f"Your heart rate is elevated ({outlier['values']}). Do you feel your heart racing or pounding?",
                    "type": "multiple_choice",
                    "options": ["No awareness of heartbeat", "Slight awareness", "Noticeable pounding", "Very uncomfortable pounding"],
                    "relevance": "Tachycardia symptom assessment for cardiac evaluation",
                    "priority": "medium"
                })
                question_id += 1
        
        # Demographics-based questions
        demographics = patient_data.get('demographics', {})
        if demographics.get('age') and question_id <= 10:
            age = int(demographics['age'])
            if age > 65:
                questions.append({
                    "id": question_id,
                    "category": "demographics",
                    "question": "As a senior patient, do you have any difficulty with balance or have you had any recent falls?",
                    "type": "multiple_choice",
                    "options": ["No balance issues", "Occasional unsteadiness", "Frequent balance problems", "Recent falls"],
                    "relevance": "Age-related fall risk assessment for elderly patients",
                    "priority": "medium"
                })
                question_id += 1
            elif age < 18:
                questions.append({
                    "id": question_id,
                    "category": "demographics",
                    "question": "For pediatric patients, have there been any recent changes in eating, sleeping, or behavior patterns?",
                    "type": "multiple_choice",
                    "options": ["No changes", "Eating changes", "Sleep changes", "Behavior changes", "Multiple changes"],
                    "relevance": "Pediatric health pattern assessment",
                    "priority": "medium"
                })
                question_id += 1
        
        # Gender-specific questions
        if demographics.get('gender') == 'female' and question_id <= 10:
            questions.append({
                "id": question_id,
                "category": "demographics",
                "question": "Are you currently pregnant, breastfeeding, or could you be pregnant?",
                "type": "multiple_choice",
                "options": ["Not pregnant", "Possibly pregnant", "Currently pregnant", "Breastfeeding"],
                "relevance": "Female reproductive status for medication and treatment safety",
                "priority": "high"
            })
            question_id += 1
        
        # Medical conditions follow-up
        medical_conditions = patient_data.get('medicalConditions', {})
        if medical_conditions.get('diabetes') == 'yes' and question_id <= 10:
            questions.append({
                "id": question_id,
                "category": "medical_history",
                "question": "How well has your diabetes been controlled in the past month?",
                "type": "multiple_choice",
                "options": ["Very well controlled", "Moderately controlled", "Poorly controlled", "Not monitoring"],
                "relevance": "Diabetes management assessment affects treatment decisions",
                "priority": "medium"
            })
            question_id += 1
        
        # Functional assessment
        if question_id <= 10:
            questions.append({
                "id": question_id,
                "category": "functional_assessment",
                "question": "How much do your current symptoms interfere with your daily activities?",
                "type": "scale",
                "min": 1,
                "max": 10,
                "min_label": "No interference",
                "max_label": "Cannot function",
                "relevance": "Functional impact assessment for treatment urgency",
                "priority": "medium"
            })
            question_id += 1
        
        # Symptom timeline
        if question_id <= 10:
            questions.append({
                "id": question_id,
                "category": "symptoms",
                "question": "When did you first notice your current symptoms?",
                "type": "multiple_choice",
                "options": ["Within the last hour", "Within the last day", "2-7 days ago", "More than a week ago"],
                "relevance": "Symptom onset timing crucial for diagnosis and urgency",
                "priority": "high"
            })
            question_id += 1
        
        # Ensure we have at least 3 questions
        while len(questions) < 3:
            questions.append({
                "id": len(questions) + 1,
                "category": "general_health",
                "question": f"Please describe any other symptoms or concerns you would like the doctor to know about.",
                "type": "textarea",
                "placeholder": "Describe any additional symptoms, concerns, or relevant information...",
                "relevance": "Additional information gathering for comprehensive assessment",
                "priority": "low"
            })
        
        outliers_list = []
        for category in vitals_outliers.values():
            outliers_list.extend([o['type'] for o in category])
        
        return {
            "questions": questions[:10],  # Limit to 10 questions
            "total_questions": len(questions[:10]),
            "outliers_addressed": outliers_list,
            "do_indicators_focus": ["patient_demographics", "vital_signs_abnormalities", "medical_history", "symptom_assessment"]
        }