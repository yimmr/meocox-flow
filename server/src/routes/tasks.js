import express from 'express';
import { storage, requireProjectId } from '../storage/index.js';
import { requireProjectIdMiddleware } from '../runtime/requireProjectId.js';
import { 
  executePipelineStep, 
  applyPipelineTemplate, 
  getAllPipelineTemplates,
  listAllOperators
} from '../services/pipelineRunner.js';

const router = express.Router();

/**
 * GET /api/tasks?projectId=...
 */
router.get('/', requireProjectIdMiddleware('query', '/api/tasks'), async (req, res) => {
  try {
    const pipeline = await storage.getPipeline(req.projectId);
    res.json(pipeline);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tasks/templates
 * List all available industrial pipeline blueprints
 */
router.get('/templates', (req, res) => {
  try {
    const templates = getAllPipelineTemplates();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tasks/operators
 * List all registered atomic pipeline operators
 */
router.get('/operators', (req, res) => {
  try {
    const operators = listAllOperators();
    res.json(operators);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tasks/apply-template
 * Switch project's pipeline to a specified template blueprint
 */
router.post('/apply-template', requireProjectIdMiddleware('either', '/api/tasks/apply-template'), async (req, res) => {
  const { templateId } = req.body;
  const pId = requireProjectId(req.projectId, 'POST /api/tasks/apply-template');
  try {
    const updatedPipeline = await applyPipelineTemplate(pId, templateId);
    res.json({ success: true, pipeline: updatedPipeline });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tasks/customize
 * Save custom composed stages to project pipeline
 */
router.post('/customize', requireProjectIdMiddleware('either', '/api/tasks/customize'), async (req, res) => {
  const { stages, templateName } = req.body;
  const pId = requireProjectId(req.projectId, 'POST /api/tasks/customize');
  try {
    const pipeline = await storage.getPipeline(pId);
    pipeline.templateId = 'template_custom';
    pipeline.templateName = templateName || '自由自定义编排流';
    pipeline.stages = Array.isArray(stages) ? stages : [];
    const totalProg = pipeline.stages.reduce((acc, s) => acc + (s.progress || 0), 0);
    pipeline.overallProgress = pipeline.stages.length > 0 ? Math.round(totalProg / pipeline.stages.length) : 0;
    await storage.savePipeline(pId, pipeline);
    res.json({ success: true, pipeline });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tasks/run-step
 * Real execution of a specific pipeline step with logs and output overview
 */
router.post('/run-step', requireProjectIdMiddleware('either', '/api/tasks/run-step'), async (req, res) => {
  const { stageId, options = {} } = req.body;
  const pId = requireProjectId(req.projectId, 'POST /api/tasks/run-step');
  try {
    await storage.updatePipelineStage(pId, {
      stageId,
      status: 'in_progress',
      progress: 30,
      details: '正在执行任务，调用底层处理引擎...'
    });

    const result = await executePipelineStep(pId, stageId, options);
    res.json(result);
  } catch (err) {
    console.error(`[Tasks] Stage ${stageId} run failed:`, err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tasks/run-all
 * Sequentially execute all stages of the pipeline
 */
router.post('/run-all', requireProjectIdMiddleware('either', '/api/tasks/run-all'), async (req, res) => {
  const { options = {} } = req.body;
  const pId = requireProjectId(req.projectId, 'POST /api/tasks/run-all');
  try {
    const pipeline = await storage.getPipeline(pId);
    const stages = pipeline.stages || [];
    const results = [];

    for (const stage of stages) {
      if (stage.status !== 'completed') {
        await storage.updatePipelineStage(pId, {
          stageId: stage.id,
          status: 'in_progress',
          progress: 20,
          details: `正在执行 ${stage.name}...`
        });
        const resStep = await executePipelineStep(pId, stage.id, options);
        results.push(resStep);
      }
    }

    const finalPipeline = await storage.getPipeline(pId);
    res.json({ success: true, results, pipeline: finalPipeline });
  } catch (err) {
    console.error(`[Tasks] Run all failed:`, err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tasks/update
 */
router.post('/update', requireProjectIdMiddleware('body', '/api/tasks/update'), async (req, res) => {
  const { stageId, status, progress, details, outputOverview, logs } = req.body;
  const pId = req.projectId;
  try {
    const pipelineState = await storage.updatePipelineStage(pId, {
      stageId,
      status,
      progress,
      details,
      outputOverview,
      logs
    });
    res.json({ success: true, pipelineState });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tasks/reset
 */
router.post('/reset', requireProjectIdMiddleware('body', '/api/tasks/reset'), async (req, res) => {
  const pId = req.projectId;
  try {
    const pipelineState = await storage.resetPipeline(pId);
    res.json({ success: true, pipelineState });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
