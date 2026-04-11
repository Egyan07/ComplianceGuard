class LocalComplianceEngine {
  constructor(database) {
    this.db = database;
    this.soc2Framework = this.getDefaultSOC2Framework();
  }

  getDefaultSOC2Framework() {
    return {
      name: 'SOC 2 Type II',
      version: '2017',
      criteria: [
        {
          category: 'Common Criteria (CC)',
          controls: [
            {
              id: 'CC1.1',
              title: 'Control Environment - Integrity and Ethical Values',
              description: 'The entity demonstrates a commitment to integrity and ethical values',
              evidenceTypes: ['policy_document', 'training_records', 'code_of_conduct', 'security_policies'],
              weight: 0.15
            },
            {
              id: 'CC1.2',
              title: 'Control Environment - Board Independence',
              description: 'The board of directors demonstrates independence from management',
              evidenceTypes: ['governance_documents', 'board_charter', 'meeting_minutes'],
              weight: 0.10
            },
            {
              id: 'CC2.1',
              title: 'Communication - Internal Communication',
              description: 'The entity internally communicates information to support functioning of internal control',
              evidenceTypes: ['communication_policies', 'training_materials', 'internal_memos'],
              weight: 0.10
            },
            {
              id: 'CC3.1',
              title: 'Risk Assessment - Objectives Definition',
              description: 'The entity defines objectives with sufficient clarity to enable risk identification',
              evidenceTypes: ['risk_assessment', 'business_objectives', 'compliance_framework'],
              weight: 0.12
            },
            {
              id: 'CC4.1',
              title: 'Monitoring - Ongoing and Separate Evaluations',
              description: 'The entity performs ongoing and separate evaluations to ascertain compliance',
              evidenceTypes: ['audit_reports', 'monitoring_logs', 'compliance_checklists'],
              weight: 0.13
            },
            {
              id: 'CC5.1',
              title: 'Control Activities - Selection and Development',
              description: 'The entity selects and develops control activities to mitigate risks',
              evidenceTypes: ['control_procedures', 'workflow_documentation', 'process_maps'],
              weight: 0.15
            },
            {
              id: 'CC6.1',
              title: 'Logical Access - Logical Access Controls',
              description: 'The entity restricts logical access to the system and information',
              evidenceTypes: ['access_logs', 'user_accounts', 'system_configs', 'network_configs'],
              weight: 0.20
            },
            {
              id: 'CC6.2',
              title: 'Logical Access - Authentication',
              description: 'Prior to issuing system credentials, the entity registers users',
              evidenceTypes: ['user_provisioning', 'access_requests', 'identity_management'],
              weight: 0.18
            },
            {
              id: 'CC6.3',
              title: 'Logical Access - Authorization',
              description: 'The entity authorizes system access based on roles and responsibilities',
              evidenceTypes: ['role_definitions', 'access_matrices', 'authorization_policies'],
              weight: 0.18
            },
            {
              id: 'CC6.4',
              title: 'Logical Access - Segregation of Duties',
              description: 'The entity restricts system access to prevent inappropriate access',
              evidenceTypes: ['segregation_matrix', 'conflict_analysis', 'access_reviews'],
              weight: 0.15
            },
            {
              id: 'CC6.5',
              title: 'Logical Access - Network Security',
              description: 'The entity implements network security controls',
              evidenceTypes: ['firewall_configs', 'network_diagrams', 'security_scans'],
              weight: 0.17
            },
            {
              id: 'CC6.6',
              title: 'Physical Access - Physical Access Controls',
              description: 'The entity restricts physical access to facilities and equipment',
              evidenceTypes: ['access_logs', 'visitor_logs', 'security_badges'],
              weight: 0.12
            },
            {
              id: 'CC6.7',
              title: 'Data Transmission - Data Transmission Controls',
              description: 'The entity controls transmission of data over networks',
              evidenceTypes: ['encryption_policies', 'network_configs', 'ssl_certificates'],
              weight: 0.15
            },
            {
              id: 'CC7.1',
              title: 'System Operations - Event Logging',
              description: 'The entity uses detection measures to identify security events',
              evidenceTypes: ['event_logs', 'monitoring_tools', 'incident_reports'],
              weight: 0.18
            },
            {
              id: 'CC7.2',
              title: 'System Operations - Vulnerability Management',
              description: 'The entity monitors system components for vulnerabilities',
              evidenceTypes: ['vulnerability_scans', 'patch_management', 'security_assessments'],
              weight: 0.16
            },
            {
              id: 'CC8.1',
              title: 'Change Management - Change Management Process',
              description: 'The entity authorizes, designs, and implements changes',
              evidenceTypes: ['change_requests', 'deployment_logs', 'approval_records'],
              weight: 0.14
            },
            {
              id: 'CC9.1',
              title: 'Risk Mitigation - Risk Mitigation Strategy',
              description: 'The entity identifies and mitigates risks through risk management',
              evidenceTypes: ['risk_register', 'mitigation_plans', 'insurance_documents'],
              weight: 0.12
            }
          ]
        },
        {
          category: 'Availability (A)',
          controls: [
            {
              id: 'A1.1',
              title: 'Availability - System Availability',
              description: 'The entity maintains availability of the system',
              evidenceTypes: ['uptime_logs', 'backup_logs', 'incident_reports', 'capacity_plans'],
              weight: 0.25
            },
            {
              id: 'A1.2',
              title: 'Availability - Environmental Protection',
              description: 'The entity protects system components from environmental threats',
              evidenceTypes: ['environmental_logs', 'facility_docs', 'disaster_recovery'],
              weight: 0.20
            },
            {
              id: 'A1.3',
              title: 'Availability - Capacity Management',
              description: 'The entity manages capacity to support availability',
              evidenceTypes: ['capacity_reports', 'performance_logs', 'resource_monitoring'],
              weight: 0.20
            },
            {
              id: 'A1.4',
              title: 'Availability - Backup and Recovery',
              description: 'The entity implements backup and recovery procedures',
              evidenceTypes: ['backup_logs', 'recovery_plans', 'test_results'],
              weight: 0.35
            }
          ]
        }
      ]
    };
  }

  async evaluateCompliance(frameworkId) {
    try {
      // Get framework details
      const framework = await this.getFrameworkById(frameworkId);
      if (!framework) {
        throw new Error(`Framework not found: ${frameworkId}`);
      }

      // Get all evidence for this framework
      const evidence = await this.db.getEvidenceByFramework(frameworkId);

      // Evaluate each control
      const evaluationResults = {
        framework_id: frameworkId,
        framework_name: framework.name,
        evaluation_date: new Date().toISOString(),
        overall_score: 0,
        total_controls: 0,
        compliant_controls: 0,
        non_compliant_controls: 0,
        partial_controls: 0,
        not_assessed_controls: 0,
        category_scores: {},
        control_results: {},
        recommendations: []
      };

      let totalWeight = 0;
      let weightedScore = 0;

      // Process each category
      for (const category of this.soc2Framework.criteria) {
        let categoryScore = 0;
        let categoryWeight = 0;
        const categoryResults = {};

        // Process each control in the category
        for (const control of category.controls) {
          const controlResult = await this.evaluateControl(control, evidence);
          categoryResults[control.id] = controlResult;

          categoryScore += controlResult.score * control.weight;
          categoryWeight += control.weight;

          // Add to overall results
          evaluationResults.control_results[control.id] = controlResult;
          evaluationResults.total_controls++;

          // Count control statuses
          switch (controlResult.status) {
            case 'compliant':
              evaluationResults.compliant_controls++;
              break;
            case 'non_compliant':
              evaluationResults.non_compliant_controls++;
              break;
            case 'partial':
              evaluationResults.partial_controls++;
              break;
            default:
              evaluationResults.not_assessed_controls++;
          }

          // Add recommendations for non-compliant controls
          if (controlResult.status !== 'compliant') {
            evaluationResults.recommendations.push({
              control_id: control.id,
              priority: controlResult.status === 'non_compliant' ? 'high' : 'medium',
              recommendation: this.generateRecommendation(control, controlResult),
              evidence_needed: control.evidenceTypes.filter(type =>
                !controlResult.available_evidence.includes(type)
              )
            });
          }
        }

        // Calculate category score
        const normalizedCategoryScore = categoryWeight > 0 ? (categoryScore / categoryWeight) : 0;
        evaluationResults.category_scores[category.category] = {
          score: normalizedCategoryScore,
          weight: categoryWeight,
          control_count: category.controls.length
        };

        // Add to overall weighted score
        weightedScore += normalizedCategoryScore * categoryWeight;
        totalWeight += categoryWeight;
      }

      // Calculate overall score
      evaluationResults.overall_score = totalWeight > 0 ? (weightedScore / totalWeight) : 0;

      // Determine overall status
      if (evaluationResults.overall_score >= 90) {
        evaluationResults.status = 'compliant';
      } else if (evaluationResults.overall_score >= 70) {
        evaluationResults.status = 'partial';
      } else {
        evaluationResults.status = 'non_compliant';
      }

      // Save evaluation results
      const evaluationId = await this.db.createEvaluation(frameworkId, evaluationResults);
      evaluationResults.id = evaluationId;

      return evaluationResults;

    } catch (error) {
      console.error('Error evaluating compliance:', error);
      throw error;
    }
  }

  async evaluateControl(control, evidence) {
    const controlEvidence = evidence.filter(item => item.control_id === control.id);

    const result = {
      control_id: control.id,
      control_title: control.title,
      control_category: this.getControlCategory(control.id),
      required_evidence: control.evidenceTypes,
      available_evidence: [],
      evidence_count: controlEvidence.length,
      score: 0,
      status: 'not_assessed',
      gaps: [],
      evidence_details: []
    };

    // Map available evidence types
    controlEvidence.forEach(item => {
      if (control.evidenceTypes.includes(item.evidence_type)) {
        result.available_evidence.push(item.evidence_type);
        result.evidence_details.push({
          id: item.id,
          type: item.evidence_type,
          title: item.title,
          collected_at: item.collected_at,
          file_path: item.file_path
        });
      }
    });

    // Remove duplicates
    result.available_evidence = [...new Set(result.available_evidence)];

    // Calculate score based on evidence coverage
    const coverageRatio = result.available_evidence.length / control.evidenceTypes.length;
    result.score = Math.round(coverageRatio * 100);

    // Determine status
    if (result.available_evidence.length === 0) {
      result.status = 'not_assessed';
    } else if (coverageRatio >= 0.9) {
      result.status = 'compliant';
    } else if (coverageRatio >= 0.5) {
      result.status = 'partial';
    } else {
      result.status = 'non_compliant';
    }

    // Identify gaps
    result.gaps = control.evidenceTypes.filter(type =>
      !result.available_evidence.includes(type)
    );

    return result;
  }

  getControlCategory(controlId) {
    for (const category of this.soc2Framework.criteria) {
      if (category.controls.some(control => control.id === controlId)) {
        return category.category;
      }
    }
    return 'Unknown';
  }

  generateRecommendation(control, controlResult) {
    const gapCount = controlResult.gaps.length;
    const totalRequired = control.evidenceTypes.length;

    if (gapCount === totalRequired) {
      return `This control requires complete evidence collection. Start by gathering: ${control.evidenceTypes.join(', ')}`;
    } else if (gapCount > totalRequired / 2) {
      return `Significant evidence gaps exist. Priority should be given to collecting: ${controlResult.gaps.slice(0, 3).join(', ')}`;
    } else {
      return `Minor evidence gaps need to be addressed: ${controlResult.gaps.join(', ')}`;
    }
  }

  async generateComplianceReport(frameworkId, format = 'detailed') {
    try {
      const evaluation = await this.db.getLatestEvaluation(frameworkId);
      if (!evaluation) {
        throw new Error('No evaluation found for this framework');
      }

      const framework = await this.getFrameworkById(frameworkId);
      const evidence = await this.db.getEvidenceByFramework(frameworkId);

      const report = {
        report_info: {
          title: `${framework.name} Compliance Report`,
          generated_at: new Date().toISOString(),
          framework_id: frameworkId,
          framework_version: framework.version
        },
        executive_summary: {
          overall_score: evaluation.overall_score,
          status: evaluation.status,
          total_controls: evaluation.total_controls,
          compliant_controls: evaluation.compliant_controls,
          non_compliant_controls: evaluation.non_compliant_controls,
          partial_controls: evaluation.partial_controls
        },
        category_breakdown: evaluation.category_scores,
        control_details: evaluation.control_results,
        recommendations: evaluation.recommendations,
        evidence_summary: await this.generateEvidenceSummary(evidence)
      };

      if (format === 'summary') {
        return {
          report_info: report.report_info,
          executive_summary: report.executive_summary,
          top_recommendations: evaluation.recommendations
            .filter(rec => rec.priority === 'high')
            .slice(0, 5)
        };
      }

      return report;

    } catch (error) {
      console.error('Error generating compliance report:', error);
      throw error;
    }
  }

  async generateEvidenceSummary(evidence) {
    const summary = {
      total_evidence: evidence.length,
      evidence_types: {},
      collection_period: {
        earliest: null,
        latest: null
      },
      file_evidence: 0,
      metadata_evidence: 0
    };

    evidence.forEach(item => {
      // Count by type
      summary.evidence_types[item.evidence_type] = (summary.evidence_types[item.evidence_type] || 0) + 1;

      // Track collection period
      const collectedAt = new Date(item.collected_at);
      if (!summary.collection_period.earliest || collectedAt < new Date(summary.collection_period.earliest)) {
        summary.collection_period.earliest = item.collected_at;
      }
      if (!summary.collection_period.latest || collectedAt > new Date(summary.collection_period.latest)) {
        summary.collection_period.latest = item.collected_at;
      }

      // Count file vs metadata
      if (item.file_path) {
        summary.file_evidence++;
      } else {
        summary.metadata_evidence++;
      }
    });

    return summary;
  }

  async getFrameworkById(frameworkId) {
    // This would typically query the database
    // For now, return the default SOC 2 framework
    if (frameworkId === 1) {
      return {
        id: 1,
        name: 'SOC 2 Type II',
        version: '2017',
        description: 'AICPA SOC 2 Type II Trust Services Criteria'
      };
    }
    return null;
  }
}

module.exports = LocalComplianceEngine;