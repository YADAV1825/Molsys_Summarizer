"""
Medical Pipeline — orchestrates the full PDF processing flow:
  Upload PDF → Extract Text → Medical JSON → Risk Score → Clinical Summary → Airport Summary → Save All
"""
import os
import json
from typing import Dict, Any, Optional

from backend.summarizer.pdf_processor import PDFProcessor
from backend.summarizer.nvidia_client import (
    extract_medical_json,
    generate_clinical_summary,
    generate_airport_summary,
    DEFAULT_MODEL_KEY,
)
from backend.summarizer.risk_engine import calculate_risk
from backend.api.patient_store import (
    save_extraction,
    save_summary,
    save_risk,
    save_chunks,
    update_profile_from_extraction,
    add_timeline_event,
    get_upload_path,
)
from backend.api.jobs import jobs_db


def run_medical_pipeline(
    username: str,
    file_id: str,
    model_key: str = DEFAULT_MODEL_KEY,
    job_id: str = None,
) -> Dict[str, Any]:
    """
    Run the full medical processing pipeline on an uploaded PDF.
    
    Steps:
      1. Extract text from PDF
      2. Extract medical JSON via LLM
      3. Calculate risk score
      4. Generate clinical summary via LLM
      5. Generate airport summary via LLM
      6. Save everything to patient folder
      7. Update timeline
    
    Returns a dict with all results.
    """
    def _update(stage, progress, status):
        if job_id and job_id in jobs_db:
            jobs_db[job_id]["stage"] = stage
            jobs_db[job_id]["progress"] = progress
            jobs_db[job_id]["status"] = status

    results = {
        "file_id": file_id,
        "model_used": model_key,
        "stages": {},
    }

    try:
        # ── Stage 1: Extract Text from PDF ──
        _update("Extracting Text", 10, "Reading PDF...")
        
        pdf_path = get_upload_path(username, file_id)
        if not pdf_path:
            raise FileNotFoundError(f"PDF not found for file_id: {file_id}")

        processor = PDFProcessor()
        chunks = processor.process_pdf(pdf_path)
        
        if not chunks:
            raise ValueError("No text could be extracted from the PDF")

        full_text = "\n\n".join(c.text for c in chunks)
        
        # Save chunks
        chunks_data = [{"index": c.index, "text": c.text} for c in chunks]
        save_chunks(username, file_id, chunks_data)
        
        results["stages"]["text_extraction"] = {
            "status": "success",
            "chunks_count": len(chunks),
            "total_chars": len(full_text),
        }

        # ── Stage 2: Medical JSON Extraction ──
        _update("Medical Extraction", 30, "Extracting medical data with AI...")
        
        medical_json = extract_medical_json(full_text, model_key)
        
        # Save extraction
        save_extraction(username, medical_json, file_id)
        
        # Update patient profile
        update_profile_from_extraction(username, medical_json)
        
        results["stages"]["medical_extraction"] = {
            "status": "success",
            "data": medical_json,
        }
        results["extraction"] = medical_json

        # ── Stage 3: Risk Scoring ──
        _update("Risk Assessment", 50, "Calculating risk score...")
        
        risk_data = calculate_risk(medical_json)
        
        # Save risk
        save_risk(username, risk_data)
        
        results["stages"]["risk_scoring"] = {
            "status": "success",
            "data": risk_data,
        }
        results["risk"] = risk_data

        # ── Stage 4: Clinical Summary ──
        _update("Clinical Summary", 70, "Generating clinical summary...")
        
        clinical_summary = generate_clinical_summary(medical_json, model_key)
        
        # Save summary
        save_summary(username, "clinical", clinical_summary, file_id)
        
        results["stages"]["clinical_summary"] = {
            "status": "success",
        }
        results["clinical_summary"] = clinical_summary

        # ── Stage 5: Airport Summary ──
        _update("Airport Summary", 85, "Generating airport screening summary...")
        
        airport_summary = generate_airport_summary(medical_json, risk_data, model_key)
        
        # Save summary
        save_summary(username, "airport", airport_summary, file_id)
        
        results["stages"]["airport_summary"] = {
            "status": "success",
        }
        results["airport_summary"] = airport_summary

        # ── Stage 6: Update Timeline ──
        _update("Finalizing", 95, "Updating patient timeline...")
        
        add_timeline_event(
            username,
            "pdf_upload",
            f"Uploaded medical report (Risk: {risk_data['risk_level']}, Score: {risk_data['risk_score']})",
            metadata={
                "file_id": file_id,
                "risk_score": risk_data["risk_score"],
                "risk_level": risk_data["risk_level"],
                "model_used": model_key,
                "conditions_found": risk_data.get("conditions_found", 0),
            }
        )

        # ── Complete ──
        _update("Complete", 100, "Pipeline completed successfully")
        results["status"] = "success"

    except Exception as e:
        error_msg = str(e)
        _update("Error", 0, f"Pipeline failed: {error_msg}")
        results["status"] = "error"
        results["error"] = error_msg
        
        # Still update timeline with failure
        try:
            add_timeline_event(
                username,
                "pipeline_error",
                f"Pipeline failed for upload: {error_msg}",
                metadata={"file_id": file_id, "error": error_msg}
            )
        except Exception:
            pass

    return results


def run_questionnaire_risk_update(username: str, questionnaire_data: Dict[str, Any]):
    """Update risk score incorporating questionnaire responses."""
    from backend.api.patient_store import get_extraction, save_risk as save_risk_data

    extraction = get_extraction(username) or {}
    
    # Add questionnaire data to the extraction for risk calculation
    extraction["questionnaire"] = questionnaire_data
    
    # Recalculate risk
    risk_data = calculate_risk(extraction)
    save_risk_data(username, risk_data)

    # Update timeline
    add_timeline_event(
        username,
        "questionnaire_completed",
        f"Health questionnaire completed (Risk: {risk_data['risk_level']}, Score: {risk_data['risk_score']})",
        metadata={
            "risk_score": risk_data["risk_score"],
            "risk_level": risk_data["risk_level"],
        }
    )

    return risk_data
