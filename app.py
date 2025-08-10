from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from openai_helper import OpenAIHelper
import os
import traceback

load_dotenv()

app = Flask(__name__)

# Production configuration
app.config['ENV'] = os.getenv('FLASK_ENV', 'production')
app.config['DEBUG'] = os.getenv('DEBUG', 'False').lower() == 'true'

openai_helper = OpenAIHelper()

@app.route('/')
def index():
    # Reset questions when starting a new session
    print("DEBUG: Flask index route called - resetting conversation state")  # Debug log
    openai_helper.reset_conversation()  # Fixed method name
    return render_template('index.html')

@app.route('/get_symptoms', methods=['POST'])
def get_symptoms():
    try:
        user_input = request.json.get('input', '')
        suggestions = openai_helper.get_symptom_suggestions(user_input)
        return jsonify(suggestions)
    except Exception as e:
        print(f"Error in get_symptoms: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/submit_symptoms', methods=['POST'])
def submit_symptoms():
    try:
        data = request.json
        print(f"Received data: {data}")  # Debug log
        followup_question = openai_helper.get_followup_questions(data)
        print(f"Generated question: {followup_question}")  # Debug log
        return jsonify(followup_question)
    except Exception as e:
        print(f"Error in submit_symptoms: {e}")
        print(traceback.format_exc())
        return jsonify({'error': str(e), 'completed': True}), 500

# New: one-by-one follow-up endpoint used by legacy UI flow
@app.route('/followup', methods=['POST'])
def followup():
    try:
        data = request.json or {}
        print(f"DEBUG: /followup called with data keys: {list(data.keys())}")
        result = openai_helper.get_next_followup_question(data)
        print(f"DEBUG: /followup returning: {result}")
        return jsonify(result)
    except Exception as e:
        print(f"Error in /followup: {e}")
        print(traceback.format_exc())
        return jsonify({'completed': True, 'error': str(e)}), 500

@app.route('/analyze', methods=['POST'])
def analyze():
    try:
        data = request.json
        print(f"DEBUG: Analyze route called with data: {data}")  # Debug log
        
        # Call analyze_symptoms which returns the correct format with possible_conditions and diagnostic_tests
        analysis = openai_helper.analyze_symptoms(data)
        
        print(f"DEBUG: Analysis result: {analysis}")  # Debug log
        return jsonify(analysis)
    except Exception as e:
        print(f"Error in analyze: {e}")
        print(traceback.format_exc())
        return jsonify({
            'error': f'Unable to analyze symptoms: {str(e)}',
            'possible_conditions': [{
                'condition': 'Error in Analysis',
                'confidence_score': 0,
                'explanation': 'Please try again or consult a healthcare professional'
            }],
            'diagnostic_tests': [],
            'red_flags': ['Seek medical attention if symptoms persist'],
            'immediate_care': ['Consider consulting a healthcare provider'],
            'follow_up': {
                'urgency': 'Routine',
                'timeline': 'As needed',
                'reason': 'System error occurred'
            },
            'lifestyle': [],
            'disclaimer': 'This system experienced an error. Please consult a healthcare professional.'
        }), 500

@app.route('/extract_labels', methods=['POST'])
def extract_labels():
    try:
        data = request.json
        symptoms = data.get('symptoms', [])
        free_text = data.get('free_text', '')
        
        print(f"DEBUG: Label extraction request - symptoms: {symptoms}, free_text: '{free_text}'")
        
        # Use OpenAI to extract labels
        label_data = openai_helper.extract_symptom_labels_with_openai(symptoms, free_text)
        
        print(f"DEBUG: Label extraction result: {label_data}")
        
        return jsonify(label_data)
        
    except Exception as e:
        print(f"Error in extract_labels: {e}")
        return jsonify({
            'error': str(e),
            'extracted_labels': {},
            'label_count': 0,
            'correlation_matrix': {},
            'feature_questions': []
        }), 500

@app.route('/generate_additional_questions', methods=['POST'])
def generate_additional_questions():
    """
    Generate dynamic additional information questions based on patient data using the OLDCARTS framework.
    Uses the OpenAI helper to generate intelligent questions tailored to the patient's
    symptoms, vitals, and demographics.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400
            
        patient_data = data.get('patient_data', {})
        max_questions = data.get('max_questions', 20)
        
        # Log the request data (excluding potentially sensitive info)
        print(f"Generating additional information questions for case type: {patient_data.get('caseType', 'unknown')}")
        print(f"Patient symptoms count: {len(patient_data.get('symptoms', []))}")
        print(f"Max questions requested: {max_questions}")
        
        # Generate questions using OpenAI
        questions = openai_helper.generate_additional_questions(patient_data, max_questions)
        
        return jsonify({
            "success": True,
            "questions": questions
        }), 200
        
    except Exception as e:
        print(f"Error generating additional information questions: {e}")
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": str(e),
            "questions": []
        }), 500

@app.route('/generate_patient_summary', methods=['POST'])
def generate_patient_summary():
    """
    Generate AI-powered patient summary with D/O indicators and vitals abnormalities analysis
    for the Patient History Followup page.
    """
    try:
        data = request.json
        print(f"DEBUG: Received patient summary request with data keys: {list(data.keys())}")
        
        # Generate comprehensive patient summary using OpenAI
        summary_result = openai_helper.generate_patient_summary_with_do_indicators(data)
        
        print(f"DEBUG: Generated summary with keys: {list(summary_result.keys())}")
        
        return jsonify(summary_result)
        
    except Exception as e:
        print(f"Error in generate_patient_summary: {e}")
        return jsonify({
            'error': 'Failed to generate patient summary',
            'patient_summary': {
                'demographics_summary': '<p>Error generating AI summary. Please try again.</p>',
                'medical_history_summary': '<p>Unable to process medical history at this time.</p>',
                'risk_factors_summary': '<p>Risk factor analysis unavailable.</p>',
                'clinical_relevance': '<p>Clinical analysis requires retry.</p>'
            },
            'vitals_abnormalities': {
                'critical_abnormalities': [],
                'moderate_abnormalities': [],
                'mild_abnormalities': [],
                'normal_findings': ['Analysis pending - please regenerate summary']
            },
            'medical_significance': {
                'diagnostic_indicators': '<p>Diagnostic analysis unavailable.</p>',
                'objective_findings': '<p>Objective findings analysis unavailable.</p>',
                'clinical_correlations': '<p>Clinical correlation analysis unavailable.</p>',
                'next_steps': '<p>Please regenerate summary for complete analysis.</p>'
            }
        }), 500

@app.route('/generate_followup_questions', methods=['POST'])
def generate_followup_questions():
    """Generate dynamic follow-up questions based on patient information with D/O indicators and vitals outliers"""
    try:
        patient_data = request.json
        print(f"DEBUG: Received patient data for followup questions: {patient_data}")
        
        # Use the OpenAI helper to generate questions
        questions_data = openai_helper.generate_followup_questions_with_do_indicators(patient_data)
        
        print(f"DEBUG: Generated {questions_data.get('total_questions', 0)} followup questions")
        
        return jsonify(questions_data)
        
    except Exception as e:
        print(f"Error in generate_followup_questions: {e}")
        return jsonify({
            'error': 'Failed to generate follow-up questions',
            'message': str(e),
            'questions': [],
            'total_questions': 0,
            'outliers_addressed': [],
            'do_indicators_focus': []
        }), 500

if __name__ == '__main__':
    # Use environment variables for production
    port = int(os.getenv('PORT', 5001))
    host = os.getenv('HOST', '0.0.0.0')
    app.run(host=host, port=port, debug=app.config['DEBUG'])