"""
Deterministic outbreak-specific medical risk scoring engine.
Calculates risk score (0-100) based on strict rules.

Risk Levels:
  0-25:  LOW
  26-50: MODERATE
  51-75: HIGH
  76-100: CRITICAL
"""
from typing import Dict, Any, List

def _is_true(val: Any) -> bool:
    if val is None:
        return False
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.lower() in ["true", "yes", "1", "y"]
    return bool(val)

def _get_float(val: Any) -> float:
    if val is None:
        return None
    try:
        if isinstance(val, str):
            # clean up strings like "< 90" or "98%"
            cleaned = ''.join(c for c in val if c.isdigit() or c == '.')
            return float(cleaned) if cleaned else None
        return float(val)
    except (ValueError, TypeError):
        return None

def calculate_risk(medical_json: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calculate deterministic risk score from medical extraction JSON.
    Expected schema includes: travel_and_exposure, real_time_iot_vitals, 
    active_symptoms, critical_lab_markers, underlying_vulnerabilities.
    """
    score = 0
    breakdown = []
    recommendations = []
    
    # Safely extract sub-dictionaries
    exposure = medical_json.get("travel_and_exposure", {}) or {}
    vitals = medical_json.get("real_time_iot_vitals", {}) or {}
    symptoms = medical_json.get("active_symptoms", {}) or {}
    labs = medical_json.get("critical_lab_markers", {}) or {}
    vulnerabilities = medical_json.get("underlying_vulnerabilities", {}) or {}

    # 1. Base Multipliers (Exposure)
    has_transit = _is_true(exposure.get("high_risk_transit_21_days"))
    if has_transit:
        score += 30
        breakdown.append({"factor": "High-risk transit in last 21 days", "points": 30})

    if _is_true(exposure.get("contact_with_sick_individuals")):
        score += 25
        breakdown.append({"factor": "Contact with sick individuals", "points": 25})

    # 2. Symptom Penalties
    has_bleeding = _is_true(symptoms.get("unexplained_bleeding_or_bruising"))
    if has_bleeding:
        if has_transit:
            score += 100 # Force critical
            breakdown.append({"factor": "Bleeding combined with high-risk transit (CRITICAL OVERRIDE)", "points": 100})
        else:
            score += 40
            breakdown.append({"factor": "Unexplained bleeding or bruising", "points": 40})

    if _is_true(symptoms.get("sudden_fever")):
        score += 20
        breakdown.append({"factor": "Sudden fever", "points": 20})

    if _is_true(symptoms.get("gastrointestinal_distress")):
        score += 15
        breakdown.append({"factor": "Gastrointestinal distress", "points": 15})

    # 3. Vitals
    spo2 = _get_float(vitals.get("spo2_percentage"))
    if spo2 is not None and spo2 < 92:
        score += 20
        breakdown.append({"factor": f"Low SPO2 ({spo2}%)", "points": 20})

    temp = _get_float(vitals.get("temperature_celsius"))
    if temp is not None and temp > 38.5:
        score += 20
        breakdown.append({"factor": f"High Temperature ({temp}°C)", "points": 20})

    # 4. Critical Lab Markers
    platelets = _get_float(labs.get("platelet_count"))
    if platelets is not None and platelets < 100000:
        score += 30
        breakdown.append({"factor": f"Low Platelet Count ({platelets})", "points": 30})

    wbc = _get_float(labs.get("wbc_count"))
    if wbc is not None and (wbc > 12000 or wbc < 4000):
        score += 15
        breakdown.append({"factor": f"Abnormal WBC Count ({wbc})", "points": 15})

    crp = _get_float(labs.get("crp_inflammation"))
    if crp is not None and crp > 10:
        score += 15
        breakdown.append({"factor": f"High CRP ({crp})", "points": 15})

    # 5. Underlying Vulnerabilities
    # +5 for ANY true underlying vulnerability
    vuln_count = sum(1 for k, v in vulnerabilities.items() if _is_true(v))
    if vuln_count > 0:
        score += 5
        breakdown.append({"factor": "Underlying health vulnerabilities", "points": 5})

    # Cap at 100
    score = min(score, 100)

    # Determine level
    if score <= 25:
        risk_level = "LOW"
    elif score <= 50:
        risk_level = "MODERATE"
    elif score <= 75:
        risk_level = "HIGH"
    else:
        risk_level = "CRITICAL"

    # Generate recommendations
    if risk_level == "CRITICAL":
        recommendations.append("Immediate medical attention required")
        recommendations.append("Do not clear for travel without medical clearance")
        recommendations.append("Contact airport medical team immediately")
    elif risk_level == "HIGH":
        recommendations.append("Secondary health screening recommended")
        recommendations.append("Medical clearance required before travel")
        recommendations.append("Monitor vitals before boarding")
    elif risk_level == "MODERATE":
        recommendations.append("Health advisory issued")
        recommendations.append("Self-monitoring recommended during travel")
        recommendations.append("Carry medications and medical documentation")
    else:
        recommendations.append("Cleared for travel")
        recommendations.append("No additional screening required")

    return {
        "risk_score": score,
        "risk_level": risk_level,
        "breakdown": breakdown,
        "recommendations": recommendations,
        # Default back-compat fields for dashboard counts
        "conditions_found": vuln_count,
        "symptoms_found": sum(1 for k, v in symptoms.items() if _is_true(v)),
        "abnormal_labs_found": 1 if (platelets and platelets < 100000) or (wbc and (wbc > 12000 or wbc < 4000)) or (crp and crp > 10) else 0,
    }
