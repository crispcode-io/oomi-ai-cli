import { scaffoldPersonaApp } from './scaffold.js';

export function extractPersonaJobPayload(message = {}) {
  const metadata = message.metadata && typeof message.metadata === 'object' ? message.metadata : {};
  const payload = metadata.payload && typeof metadata.payload === 'object' ? metadata.payload : null;

  if (metadata.type !== 'persona_job' || !payload) {
    throw new Error('Message is not a persona job payload.');
  }

  return payload;
}

export async function executePersonaJob({
  message,
  installWorkspace = async () => {},
  startWorkspace = async () => ({ pid: null, logFilePath: '' }),
  waitForRuntime = async () => {},
  registerRuntime = async () => {},
  destroyWorkspace = async () => ({ deleted: false }),
  onJobStart = async () => {},
  onJobSuccess = async () => {},
  onJobFailure = async () => {},
}) {
  const payload = extractPersonaJobPayload(message);
  const jobId = String(payload.jobId || message?.metadata?.jobId || '').trim();
  if (!jobId) {
    throw new Error('Persona job payload is missing jobId.');
  }

  try {
    if (!['create_persona_runtime', 'destroy_persona_runtime'].includes(payload.jobType)) {
      throw new Error(`Unsupported persona job type: ${payload.jobType || 'unknown'}`);
    }

    await onJobStart({ jobId, payload });

    const persona = payload.persona && typeof payload.persona === 'object' ? payload.persona : {};
    const scaffold = payload.scaffold && typeof payload.scaffold === 'object' ? payload.scaffold : {};
    const templateVersion = String(persona.templateVersion || 'v1').trim() || 'v1';

    if (payload.jobType === 'destroy_persona_runtime') {
      const workspacePath = String(scaffold.outDir || '').trim();
      if (!workspacePath) {
        throw new Error('Destroy persona job payload is missing scaffold.outDir.');
      }

      const result = {
        workspacePath,
        ...(await destroyWorkspace({
          payload,
          workspacePath,
        })),
      };

      await onJobSuccess({ jobId, payload, result });

      return {
        ok: true,
        jobId,
        result,
      };
    }

    const scaffoldResult = scaffoldPersonaApp({
      slug: String(persona.slug || '').trim(),
      name: String(persona.name || '').trim(),
      description: String(persona.description || '').trim(),
      outDir: String(scaffold.outDir || '').trim(),
      templateVersion,
      force: true,
    });

    await installWorkspace({
      payload,
      workspacePath: scaffoldResult.outDir,
      scaffoldResult,
    });

    const runtime = {
      transport: 'local',
      endpoint: `http://127.0.0.1:${scaffoldResult.defaultPort}`,
      localPort: scaffoldResult.defaultPort,
      healthcheckUrl: `http://127.0.0.1:${scaffoldResult.defaultPort}${scaffoldResult.healthPath}`,
    };
    const processInfo = await startWorkspace({
      payload,
      workspacePath: scaffoldResult.outDir,
      scaffoldResult,
      runtime,
    });
    await waitForRuntime({
      payload,
      workspacePath: scaffoldResult.outDir,
      scaffoldResult,
      runtime,
      processInfo,
    });

    const result = {
      workspacePath: scaffoldResult.outDir,
      localPort: runtime.localPort,
      transport: runtime.transport,
      endpoint: runtime.endpoint,
      healthcheckUrl: runtime.healthcheckUrl,
      pid: processInfo?.pid || null,
      logFilePath: processInfo?.logFilePath || '',
      templateVersion,
    };

    await registerRuntime({ jobId, payload, result });
    await onJobSuccess({ jobId, payload, result });

    return {
      ok: true,
      jobId,
      result,
    };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Persona job execution failed.';
    await onJobFailure({
      jobId,
      payload,
      error: {
        code: 'PERSONA_JOB_EXECUTION_FAILED',
        message: messageText,
      },
    });

    return {
      ok: false,
      jobId,
      error: {
        code: 'PERSONA_JOB_EXECUTION_FAILED',
        message: messageText,
      },
    };
  }
}
