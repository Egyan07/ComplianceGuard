"""
SOC 2 Control Framework Implementation

This module provides a comprehensive SOC 2 control framework with pre-built
templates for all Trust Service Criteria categories:
- CC: Common Criteria
- A: Availability
- C: Confidentiality
- PI: Processing Integrity
- CA: Confidentiality and Availability

Each control includes evidence mapping requirements and compliance criteria.
"""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from enum import Enum


class ControlCategory(str, Enum):
    """SOC 2 Trust Service Criteria categories."""
    COMMON_CRITERIA = "CC"
    AVAILABILITY = "A"
    CONFIDENTIALITY = "C"
    PROCESSING_INTEGRITY = "PI"
    CONFIDENTIALITY_AVAILABILITY = "CA"


class ControlStatus(str, Enum):
    """Control implementation status."""
    NOT_IMPLEMENTED = "not_implemented"
    PARTIALLY_IMPLEMENTED = "partially_implemented"
    FULLY_IMPLEMENTED = "fully_implemented"
    NOT_APPLICABLE = "not_applicable"


@dataclass
class EvidenceRequirement:
    """Evidence requirement for a SOC 2 control."""
    id: str
    name: str
    description: str
    type: str  # document, system, interview, observation
    frequency: str  # continuous, periodic, annual, event_driven
    retention_period: str


@dataclass
class SOC2Control:
    """SOC 2 control definition with evidence mapping."""
    id: str
    title: str
    description: str
    category: ControlCategory
    control_objective: str
    implementation_guidance: str
    evidence_mapping: List[EvidenceRequirement] = field(default_factory=list)
    related_controls: List[str] = field(default_factory=list)
    risk_level: str = "medium"  # low, medium, high


class SOC2Framework:
    """
    SOC 2 Control Framework with pre-built templates.

    Provides comprehensive SOC 2 controls across all Trust Service Criteria.
    """

    def __init__(self):
        self.controls: Dict[str, SOC2Control] = {}
        self._initialize_controls()

    def _initialize_controls(self):
        """Initialize SOC 2 controls with pre-built templates."""
        self._initialize_common_criteria_controls()
        self._initialize_availability_controls()
        self._initialize_confidentiality_controls()
        self._initialize_processing_integrity_controls()
        self._initialize_confidentiality_availability_controls()

    def _initialize_common_criteria_controls(self):
        """Initialize Common Criteria (CC) controls."""
        cc_controls = [
            SOC2Control(
                id="CC1.1",
                title="Control Environment",
                description="The entity demonstrates a commitment to integrity and ethical values.",
                category=ControlCategory.COMMON_CRITERIA,
                control_objective="Establish and maintain a control environment that sets the tone at the top.",
                implementation_guidance="Implement policies, organizational structure, and governance processes.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CC1.1-E1",
                        name="Code of Conduct",
                        description="Documented code of conduct and ethics policy",
                        type="document",
                        frequency="annual",
                        retention_period="7_years"
                    ),
                    EvidenceRequirement(
                        id="CC1.1-E2",
                        name="Board Oversight",
                        description="Board meeting minutes showing oversight activities",
                        type="document",
                        frequency="periodic",
                        retention_period="7_years"
                    )
                ],
                related_controls=["CC1.2", "CC1.3"]
            ),
            SOC2Control(
                id="CC1.2",
                title="Board Independence",
                description="The board of directors demonstrates independence from management.",
                category=ControlCategory.COMMON_CRITERIA,
                control_objective="Ensure board independence in oversight activities.",
                implementation_guidance="Establish independent board structure and procedures.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CC1.2-E1",
                        name="Board Charter",
                        description="Board charter and independence criteria",
                        type="document",
                        frequency="annual",
                        retention_period="7_years"
                    )
                ]
            ),
            SOC2Control(
                id="CC1.3",
                title="Management Philosophy",
                description="Management demonstrates commitment to competence.",
                category=ControlCategory.COMMON_CRITERIA,
                control_objective="Ensure management demonstrates commitment to technical and professional competence.",
                implementation_guidance="Establish competency requirements and training programs.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CC1.3-E1",
                        name="Competency Framework",
                        description="Documented competency requirements",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="CC2.1",
                title="Communication and Information",
                description="The entity obtains or generates and uses relevant, quality information.",
                category=ControlCategory.COMMON_CRITERIA,
                control_objective="Ensure information is identified, captured, and distributed to support control operations.",
                implementation_guidance="Implement information systems and communication processes.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CC2.1-E1",
                        name="Information Systems Documentation",
                        description="Documentation of information systems and data flows",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ],
                related_controls=["CC2.2", "CC2.3"]
            ),
            SOC2Control(
                id="CC2.2",
                title="Information Quality",
                description="The entity internally communicates information.",
                category=ControlCategory.COMMON_CRITERIA,
                control_objective="Ensure internal communication supports the functioning of controls.",
                implementation_guidance="Establish internal communication processes.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CC2.2-E1",
                        name="Communication Procedures",
                        description="Internal communication procedures",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="CC2.3",
                title="External Communication",
                description="The entity communicates with external parties.",
                category=ControlCategory.COMMON_CRITERIA,
                control_objective="Ensure external communication supports accountability.",
                implementation_guidance="Establish external communication protocols.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CC2.3-E1",
                        name="External Communication Policy",
                        description="External communication policy",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="CC3.1",
                title="Risk Assessment Process",
                description="The entity specifies objectives with sufficient clarity.",
                category=ControlCategory.COMMON_CRITERIA,
                control_objective="Establish clear objectives to enable risk identification and assessment.",
                implementation_guidance="Define objectives at various levels and ensure they are understood throughout the organization.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CC3.1-E1",
                        name="Risk Assessment Documentation",
                        description="Documented risk assessment methodology and results",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="CC3.2",
                title="Risk Identification",
                description="The entity identifies risks to the achievement of objectives.",
                category=ControlCategory.COMMON_CRITERIA,
                control_objective="Identify and analyze risks to achievement of objectives.",
                implementation_guidance="Implement risk identification and analysis processes.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CC3.2-E1",
                        name="Risk Register",
                        description="Comprehensive risk register",
                        type="document",
                        frequency="quarterly",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="CC3.3",
                title="Risk Analysis",
                description="The entity analyzes risks.",
                category=ControlCategory.COMMON_CRITERIA,
                control_objective="Analyze identified risks to determine their potential impact.",
                implementation_guidance="Implement risk analysis methodology.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CC3.3-E1",
                        name="Risk Analysis Reports",
                        description="Risk analysis and impact assessment reports",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="CC4.1",
                title="Monitoring Activities",
                description="The entity selects, develops, and performs ongoing and/or separate evaluations.",
                category=ControlCategory.COMMON_CRITERIA,
                control_objective="Implement ongoing and separate evaluations to ascertain whether controls are present and functioning.",
                implementation_guidance="Establish monitoring processes and procedures.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CC4.1-E1",
                        name="Monitoring Procedures",
                        description="Documented monitoring procedures and schedules",
                        type="document",
                        frequency="continuous",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="CC4.2",
                title="Separate Evaluations",
                description="The entity conducts separate evaluations of controls.",
                category=ControlCategory.COMMON_CRITERIA,
                control_objective="Conduct separate evaluations to assess control effectiveness.",
                implementation_guidance="Implement separate evaluation procedures.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CC4.2-E1",
                        name="Audit Reports",
                        description="Internal audit and assessment reports",
                        type="document",
                        frequency="annual",
                        retention_period="5_years"
                    )
                ]
            ),
            SOC2Control(
                id="CC5.1",
                title="Control Activities",
                description="The entity selects and develops control activities.",
                category=ControlCategory.COMMON_CRITERIA,
                control_objective="Select and develop control activities that contribute to achievement of objectives.",
                implementation_guidance="Implement control activities that mitigate risks.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CC5.1-E1",
                        name="Control Activity Documentation",
                        description="Documentation of control activities and procedures",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="CC5.2",
                title="Control Activities Development",
                description="The entity develops control activities that mitigate risk.",
                category=ControlCategory.COMMON_CRITERIA,
                control_objective="Develop control activities to address identified risks.",
                implementation_guidance="Design controls to address specific risks.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CC5.2-E1",
                        name="Risk Control Matrix",
                        description="Risk control matrix mapping",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="CC6.1",
                title="Logical Access Controls",
                description="The entity restricts logical access to systems.",
                category=ControlCategory.COMMON_CRITERIA,
                control_objective="Restrict logical access to data and systems to authorized users.",
                implementation_guidance="Implement logical access controls and procedures.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CC6.1-E1",
                        name="Access Control Policy",
                        description="Logical access control policy",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    ),
                    EvidenceRequirement(
                        id="CC6.1-E2",
                        name="Access Logs",
                        description="System access logs",
                        type="system",
                        frequency="continuous",
                        retention_period="1_year"
                    )
                ]
            ),
            SOC2Control(
                id="CC6.2",
                title="Authentication",
                description="The entity implements authentication mechanisms.",
                category=ControlCategory.COMMON_CRITERIA,
                control_objective="Authenticate users accessing systems.",
                implementation_guidance="Implement authentication mechanisms.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CC6.2-E1",
                        name="Authentication Policy",
                        description="Authentication policy and procedures",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="CC6.3",
                title="Authorization",
                description="The entity implements authorization controls.",
                category=ControlCategory.COMMON_CRITERIA,
                control_objective="Authorize access to systems and data.",
                implementation_guidance="Implement authorization controls.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CC6.3-E1",
                        name="Authorization Matrix",
                        description="Access authorization matrix",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="CC7.1",
                title="System Operations",
                description="The entity manages system operations.",
                category=ControlCategory.COMMON_CRITERIA,
                control_objective="Manage system operations effectively.",
                implementation_guidance="Implement system operations procedures.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CC7.1-E1",
                        name="Operations Procedures",
                        description="System operations procedures",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="CC8.1",
                title="Change Management",
                description="The entity manages changes to systems.",
                category=ControlCategory.COMMON_CRITERIA,
                control_objective="Manage changes to systems and applications.",
                implementation_guidance="Implement change management processes.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CC8.1-E1",
                        name="Change Management Policy",
                        description="Change management policy",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="CC9.1",
                title="Risk Mitigation",
                description="The entity mitigates risk.",
                category=ControlCategory.COMMON_CRITERIA,
                control_objective="Mitigate risks to objectives.",
                implementation_guidance="Implement risk mitigation strategies.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CC9.1-E1",
                        name="Risk Mitigation Plan",
                        description="Risk mitigation plan",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            )
        ]

        for control in cc_controls:
            self.controls[control.id] = control

    def _initialize_availability_controls(self):
        """Initialize Availability (A) controls."""
        a_controls = [
            SOC2Control(
                id="A1.1",
                title="Availability Policies and Procedures",
                description="The entity maintains availability policies and procedures.",
                category=ControlCategory.AVAILABILITY,
                control_objective="Ensure systems remain available for operation and are protected against unauthorized access.",
                implementation_guidance="Develop and maintain availability policies.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="A1.1-E1",
                        name="Availability Policy",
                        description="Documented availability policy and procedures",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    ),
                    EvidenceRequirement(
                        id="A1.1-E2",
                        name="System Monitoring Logs",
                        description="System availability monitoring logs",
                        type="system",
                        frequency="continuous",
                        retention_period="1_year"
                    )
                ]
            ),
            SOC2Control(
                id="A1.2",
                title="Capacity Management",
                description="The entity manages capacity to support availability requirements.",
                category=ControlCategory.AVAILABILITY,
                control_objective="Monitor and manage system capacity to meet availability requirements.",
                implementation_guidance="Implement capacity planning and monitoring processes.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="A1.2-E1",
                        name="Capacity Planning Reports",
                        description="Capacity planning and monitoring reports",
                        type="document",
                        frequency="quarterly",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="A1.3",
                title="Backup and Recovery",
                description="The entity implements backup and recovery procedures.",
                category=ControlCategory.AVAILABILITY,
                control_objective="Ensure systems can be recovered in the event of disruption.",
                implementation_guidance="Implement backup and disaster recovery procedures.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="A1.3-E1",
                        name="Backup Verification Logs",
                        description="Backup verification and test results",
                        type="system",
                        frequency="monthly",
                        retention_period="1_year"
                    )
                ]
            ),
            SOC2Control(
                id="A1.4",
                title="Incident Response",
                description="The entity responds to availability incidents.",
                category=ControlCategory.AVAILABILITY,
                control_objective="Detect and respond to availability incidents.",
                implementation_guidance="Implement incident response procedures.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="A1.4-E1",
                        name="Incident Response Plan",
                        description="Availability incident response plan",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="A1.5",
                title="System Performance Monitoring",
                description="The entity monitors system performance.",
                category=ControlCategory.AVAILABILITY,
                control_objective="Monitor system performance to ensure availability.",
                implementation_guidance="Implement performance monitoring tools and procedures.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="A1.5-E1",
                        name="Performance Reports",
                        description="System performance monitoring reports",
                        type="system",
                        frequency="daily",
                        retention_period="1_year"
                    )
                ]
            ),
            SOC2Control(
                id="A2.1",
                title="Environmental Controls",
                description="The entity implements environmental controls.",
                category=ControlCategory.AVAILABILITY,
                control_objective="Protect systems from environmental threats.",
                implementation_guidance="Implement environmental protection measures.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="A2.1-E1",
                        name="Environmental Controls Documentation",
                        description="Environmental controls documentation",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="A2.2",
                title="Facility Access",
                description="The entity controls facility access.",
                category=ControlCategory.AVAILABILITY,
                control_objective="Control physical access to facilities.",
                implementation_guidance="Implement facility access controls.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="A2.2-E1",
                        name="Facility Access Logs",
                        description="Facility access logs",
                        type="system",
                        frequency="continuous",
                        retention_period="1_year"
                    )
                ]
            ),
            SOC2Control(
                id="A3.1",
                title="Network Security",
                description="The entity implements network security controls.",
                category=ControlCategory.AVAILABILITY,
                control_objective="Protect network infrastructure.",
                implementation_guidance="Implement network security measures.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="A3.1-E1",
                        name="Network Security Policy",
                        description="Network security policy",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="A3.2",
                title="Firewall Management",
                description="The entity manages firewall configurations.",
                category=ControlCategory.AVAILABILITY,
                control_objective="Manage firewall configurations.",
                implementation_guidance="Implement firewall management procedures.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="A3.2-E1",
                        name="Firewall Configuration",
                        description="Firewall configuration documentation",
                        type="document",
                        frequency="quarterly",
                        retention_period="3_years"
                    )
                ]
            )
        ]

        for control in a_controls:
            self.controls[control.id] = control

    def _initialize_confidentiality_controls(self):
        """Initialize Confidentiality (C) controls."""
        c_controls = [
            SOC2Control(
                id="C1.1",
                title="Confidentiality Policies",
                description="The entity maintains confidentiality policies and procedures.",
                category=ControlCategory.CONFIDENTIALITY,
                control_objective="Ensure confidential information is protected from unauthorized access.",
                implementation_guidance="Develop and maintain confidentiality policies.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="C1.1-E1",
                        name="Confidentiality Policy",
                        description="Documented confidentiality policy and procedures",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    ),
                    EvidenceRequirement(
                        id="C1.1-E2",
                        name="Access Control Logs",
                        description="Access control and authorization logs",
                        type="system",
                        frequency="continuous",
                        retention_period="1_year"
                    )
                ]
            ),
            SOC2Control(
                id="C1.2",
                title="Data Classification",
                description="The entity classifies information according to sensitivity.",
                category=ControlCategory.CONFIDENTIALITY,
                control_objective="Classify information based on sensitivity and criticality.",
                implementation_guidance="Implement data classification schema and procedures.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="C1.2-E1",
                        name="Data Classification Policy",
                        description="Documented data classification policy",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="C1.3",
                title="Encryption Controls",
                description="The entity implements encryption for confidential data.",
                category=ControlCategory.CONFIDENTIALITY,
                control_objective="Protect confidential data through encryption.",
                implementation_guidance="Implement encryption technologies and procedures.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="C1.3-E1",
                        name="Encryption Standards",
                        description="Encryption standards and procedures",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="C1.4",
                title="Data Masking",
                description="The entity implements data masking for sensitive information.",
                category=ControlCategory.CONFIDENTIALITY,
                control_objective="Protect sensitive data through masking techniques.",
                implementation_guidance="Implement data masking procedures.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="C1.4-E1",
                        name="Data Masking Procedures",
                        description="Data masking procedures and controls",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="C2.1",
                title="Confidentiality Agreements",
                description="The entity obtains confidentiality agreements.",
                category=ControlCategory.CONFIDENTIALITY,
                control_objective="Obtain confidentiality agreements from personnel and third parties.",
                implementation_guidance="Implement confidentiality agreement processes.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="C2.1-E1",
                        name="Confidentiality Agreements",
                        description="Signed confidentiality agreements",
                        type="document",
                        frequency="annual",
                        retention_period="7_years"
                    )
                ]
            ),
            SOC2Control(
                id="C2.2",
                title="Data Retention",
                description="The entity implements data retention policies.",
                category=ControlCategory.CONFIDENTIALITY,
                control_objective="Retain data according to policy requirements.",
                implementation_guidance="Implement data retention procedures.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="C2.2-E1",
                        name="Data Retention Policy",
                        description="Data retention policy",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="C2.3",
                title="Data Disposal",
                description="The entity securely disposes of confidential data.",
                category=ControlCategory.CONFIDENTIALITY,
                control_objective="Dispose of confidential data securely.",
                implementation_guidance="Implement secure data disposal procedures.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="C2.3-E1",
                        name="Disposal Procedures",
                        description="Data disposal procedures",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="C3.1",
                title="Third Party Confidentiality",
                description="The entity ensures third parties maintain confidentiality.",
                category=ControlCategory.CONFIDENTIALITY,
                control_objective="Ensure third parties protect confidential information.",
                implementation_guidance="Implement third party confidentiality requirements.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="C3.1-E1",
                        name="Third Party Agreements",
                        description="Third party confidentiality agreements",
                        type="document",
                        frequency="annual",
                        retention_period="7_years"
                    )
                ]
            ),
            SOC2Control(
                id="C3.2",
                title="Confidentiality Monitoring",
                description="The entity monitors confidentiality compliance.",
                category=ControlCategory.CONFIDENTIALITY,
                control_objective="Monitor compliance with confidentiality requirements.",
                implementation_guidance="Implement confidentiality monitoring procedures.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="C3.2-E1",
                        name="Monitoring Reports",
                        description="Confidentiality compliance monitoring reports",
                        type="document",
                        frequency="quarterly",
                        retention_period="3_years"
                    )
                ]
            )
        ]

        for control in c_controls:
            self.controls[control.id] = control

    def _initialize_processing_integrity_controls(self):
        """Initialize Processing Integrity (PI) controls."""
        pi_controls = [
            SOC2Control(
                id="PI1.1",
                title="Processing Integrity Controls",
                description="The entity implements controls to ensure processing integrity.",
                category=ControlCategory.PROCESSING_INTEGRITY,
                control_objective="Ensure system processing is complete, valid, accurate, and authorized.",
                implementation_guidance="Implement processing validation and error detection controls.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="PI1.1-E1",
                        name="Processing Validation Logs",
                        description="System processing validation logs",
                        type="system",
                        frequency="continuous",
                        retention_period="1_year"
                    )
                ]
            ),
            SOC2Control(
                id="PI1.2",
                title="Quality Assurance",
                description="The entity maintains quality assurance procedures.",
                category=ControlCategory.PROCESSING_INTEGRITY,
                control_objective="Ensure processing quality through validation and testing.",
                implementation_guidance="Implement quality assurance and testing procedures.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="PI1.2-E1",
                        name="QA Test Results",
                        description="Quality assurance test results and reports",
                        type="document",
                        frequency="periodic",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="PI1.3",
                title="Input Validation",
                description="The entity validates input data.",
                category=ControlCategory.PROCESSING_INTEGRITY,
                control_objective="Ensure input data is valid and accurate.",
                implementation_guidance="Implement input validation controls.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="PI1.3-E1",
                        name="Input Validation Rules",
                        description="Input validation rules and procedures",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="PI1.4",
                title="Processing Controls",
                description="The entity implements processing controls.",
                category=ControlCategory.PROCESSING_INTEGRITY,
                control_objective="Ensure processing operations are accurate and complete.",
                implementation_guidance="Implement processing controls and validation.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="PI1.4-E1",
                        name="Processing Procedures",
                        description="Data processing procedures",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="PI1.5",
                title="Output Validation",
                description="The entity validates output data.",
                category=ControlCategory.PROCESSING_INTEGRITY,
                control_objective="Ensure output data is accurate and complete.",
                implementation_guidance="Implement output validation controls.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="PI1.5-E1",
                        name="Output Validation Reports",
                        description="Output validation reports",
                        type="document",
                        frequency="periodic",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="PI2.1",
                title="Error Handling",
                description="The entity implements error handling procedures.",
                category=ControlCategory.PROCESSING_INTEGRITY,
                control_objective="Handle processing errors appropriately.",
                implementation_guidance="Implement error detection and handling procedures.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="PI2.1-E1",
                        name="Error Handling Procedures",
                        description="Error handling procedures",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="PI2.2",
                title="Transaction Integrity",
                description="The entity ensures transaction integrity.",
                category=ControlCategory.PROCESSING_INTEGRITY,
                control_objective="Ensure transaction completeness and accuracy.",
                implementation_guidance="Implement transaction validation controls.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="PI2.2-E1",
                        name="Transaction Logs",
                        description="Transaction processing logs",
                        type="system",
                        frequency="continuous",
                        retention_period="1_year"
                    )
                ]
            ),
            SOC2Control(
                id="PI3.1",
                title="Processing Monitoring",
                description="The entity monitors processing activities.",
                category=ControlCategory.PROCESSING_INTEGRITY,
                control_objective="Monitor processing activities for integrity.",
                implementation_guidance="Implement processing monitoring controls.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="PI3.1-E1",
                        name="Processing Monitoring Reports",
                        description="Processing monitoring reports",
                        type="document",
                        frequency="daily",
                        retention_period="1_year"
                    )
                ]
            ),
            SOC2Control(
                id="PI3.2",
                title="Exception Reporting",
                description="The entity reports processing exceptions.",
                category=ControlCategory.PROCESSING_INTEGRITY,
                control_objective="Report processing exceptions.",
                implementation_guidance="Implement exception reporting procedures.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="PI3.2-E1",
                        name="Exception Reports",
                        description="Processing exception reports",
                        type="document",
                        frequency="event_driven",
                        retention_period="3_years"
                    )
                ]
            )
        ]

        for control in pi_controls:
            self.controls[control.id] = control

    def _initialize_confidentiality_availability_controls(self):
        """Initialize Confidentiality and Availability (CA) controls."""
        ca_controls = [
            SOC2Control(
                id="CA1.1",
                title="Confidentiality and Availability Management",
                description="The entity manages confidentiality and availability requirements.",
                category=ControlCategory.CONFIDENTIALITY_AVAILABILITY,
                control_objective="Ensure both confidentiality and availability requirements are met.",
                implementation_guidance="Implement integrated confidentiality and availability controls.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CA1.1-E1",
                        name="Integrated Security Plan",
                        description="Security plan addressing both confidentiality and availability",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="CA1.2",
                title="Incident Response",
                description="The entity implements incident response procedures.",
                category=ControlCategory.CONFIDENTIALITY_AVAILABILITY,
                control_objective="Detect, respond to, and recover from security incidents.",
                implementation_guidance="Implement incident response plan and procedures.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CA1.2-E1",
                        name="Incident Response Plan",
                        description="Documented incident response plan",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    ),
                    EvidenceRequirement(
                        id="CA1.2-E2",
                        name="Incident Logs",
                        description="Security incident response logs",
                        type="system",
                        frequency="event_driven",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="CA1.3",
                title="Security Awareness Training",
                description="The entity provides security awareness training.",
                category=ControlCategory.CONFIDENTIALITY_AVAILABILITY,
                control_objective="Ensure personnel understand security responsibilities.",
                implementation_guidance="Provide regular security awareness training to all personnel.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CA1.3-E1",
                        name="Training Records",
                        description="Security awareness training completion records",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="CA1.4",
                title="Physical Security",
                description="The entity implements physical security controls.",
                category=ControlCategory.CONFIDENTIALITY_AVAILABILITY,
                control_objective="Protect facilities and equipment from unauthorized access.",
                implementation_guidance="Implement physical security measures.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CA1.4-E1",
                        name="Physical Security Policy",
                        description="Physical security policy and procedures",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="CA1.5",
                title="Vendor Management",
                description="The entity manages third-party vendors.",
                category=ControlCategory.CONFIDENTIALITY_AVAILABILITY,
                control_objective="Ensure vendors meet security requirements.",
                implementation_guidance="Implement vendor management processes.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CA1.5-E1",
                        name="Vendor Assessment Reports",
                        description="Vendor security assessment reports",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="CA1.6",
                title="Change Management",
                description="The entity implements change management procedures.",
                category=ControlCategory.CONFIDENTIALITY_AVAILABILITY,
                control_objective="Manage changes to systems and processes.",
                implementation_guidance="Implement change management controls.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CA1.6-E1",
                        name="Change Management Procedures",
                        description="Change management procedures",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="CA1.7",
                title="Business Continuity",
                description="The entity maintains business continuity plans.",
                category=ControlCategory.CONFIDENTIALITY_AVAILABILITY,
                control_objective="Ensure continuity of operations during disruptions.",
                implementation_guidance="Develop and maintain business continuity plans.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CA1.7-E1",
                        name="Business Continuity Plan",
                        description="Business continuity and disaster recovery plan",
                        type="document",
                        frequency="annual",
                        retention_period="3_years"
                    )
                ]
            ),
            SOC2Control(
                id="CA1.8",
                title="Security Monitoring",
                description="The entity monitors security events.",
                category=ControlCategory.CONFIDENTIALITY_AVAILABILITY,
                control_objective="Monitor security events and activities.",
                implementation_guidance="Implement security monitoring tools and procedures.",
                evidence_mapping=[
                    EvidenceRequirement(
                        id="CA1.8-E1",
                        name="Security Monitoring Logs",
                        description="Security monitoring and alert logs",
                        type="system",
                        frequency="continuous",
                        retention_period="1_year"
                    )
                ]
            )
        ]

        for control in ca_controls:
            self.controls[control.id] = control

    def get_all_controls(self) -> List[SOC2Control]:
        """Get all SOC 2 controls."""
        return list(self.controls.values())

    def get_control(self, control_id: str) -> Optional[SOC2Control]:
        """Get a specific control by ID."""
        return self.controls.get(control_id)

    def get_controls_by_category(self, category: str) -> List[SOC2Control]:
        """Get all controls for a specific category."""
        return [control for control in self.controls.values()
                if control.category.value == category or control.category == category]

    def get_control_count(self) -> int:
        """Get total number of controls."""
        return len(self.controls)

    def search_controls(self, search_term: str) -> List[SOC2Control]:
        """Search controls by title or description."""
        search_term = search_term.lower()
        return [control for control in self.controls.values()
                if search_term in control.title.lower() or
                   search_term in control.description.lower() or
                   search_term in control.control_objective.lower()]

    def get_controls_by_risk_level(self, risk_level: str) -> List[SOC2Control]:
        """Get controls filtered by risk level."""
        return [control for control in self.controls.values()
                if control.risk_level == risk_level]

    def add_custom_control(self, control: SOC2Control) -> None:
        """Add a custom control to the framework."""
        self.controls[control.id] = control

    def remove_control(self, control_id: str) -> bool:
        """Remove a control from the framework."""
        if control_id in self.controls:
            del self.controls[control_id]
            return True
        return False

    def get_framework_summary(self) -> Dict[str, Any]:
        """Get a summary of the framework structure."""
        categories = {}
        for control in self.controls.values():
            category = control.category.value
            if category not in categories:
                categories[category] = 0
            categories[category] += 1

        return {
            "total_controls": len(self.controls),
            "categories": categories,
            "risk_distribution": self._get_risk_distribution()
        }

    def _get_risk_distribution(self) -> Dict[str, int]:
        """Get distribution of controls by risk level."""
        risk_dist = {}
        for control in self.controls.values():
            risk_level = control.risk_level
            if risk_level not in risk_dist:
                risk_dist[risk_level] = 0
            risk_dist[risk_level] += 1
        return risk_dist


# Convenience functions for easy access

def create_soc2_framework() -> SOC2Framework:
    """Create and return a new SOC 2 framework instance."""
    return SOC2Framework()


def get_available_categories() -> List[str]:
    """Get list of available SOC 2 categories."""
    return [category.value for category in ControlCategory]


def validate_control_id(control_id: str) -> bool:
    """Validate if a control ID follows SOC 2 format."""
    valid_prefixes = ["CC", "A", "C", "PI", "CA"]
    return any(control_id.startswith(prefix) for prefix in valid_prefixes)
