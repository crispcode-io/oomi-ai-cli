function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stripTrailingSlash(value) {
  return trimString(value).replace(/\/+$/, '');
}

async function readJsonResponse(response) {
  return response.json().catch(() => ({}));
}

async function getJson({ fetchImpl, backendUrl, path, deviceToken }) {
  const baseUrl = stripTrailingSlash(backendUrl);
  if (!baseUrl) {
    throw new Error('Backend URL is required.');
  }

  const headers = {};
  const token = trimString(deviceToken);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetchImpl(`${baseUrl}${path}`, {
    method: 'GET',
    headers,
  });

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    const errorMessage =
      trimString(payload?.error) ||
      trimString(payload?.message) ||
      `Persona API request failed (${response.status})`;
    const error = new Error(errorMessage);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function postJson({ fetchImpl, backendUrl, path, deviceToken, body }) {
  const baseUrl = stripTrailingSlash(backendUrl);
  if (!baseUrl) {
    throw new Error('Backend URL is required.');
  }
  const token = trimString(deviceToken);
  if (!token) {
    throw new Error('Device token is required.');
  }

  const response = await fetchImpl(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    const errorMessage =
      trimString(payload?.error) ||
      trimString(payload?.message) ||
      `Persona API request failed (${response.status})`;
    const error = new Error(errorMessage);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export function createPersonaApiClient({
  backendUrl,
  deviceToken,
  deviceId,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch implementation is required.');
  }

  const resolvedBackendUrl = stripTrailingSlash(backendUrl);
  const resolvedDeviceToken = trimString(deviceToken);
  const resolvedDeviceId = trimString(deviceId);

  function withDevice(body = {}) {
    if (!resolvedDeviceId) {
      return body;
    }
    return {
      ...body,
      deviceId: resolvedDeviceId,
    };
  }

  return {
    listPersonas() {
      return getJson({
        fetchImpl,
        backendUrl: resolvedBackendUrl,
        deviceToken: resolvedDeviceToken,
        path: '/v1/personas',
      });
    },

    getPersona({
      slug,
    }) {
      const safeSlug = trimString(slug);
      if (!safeSlug) {
        throw new Error('Persona slug is required.');
      }

      return getJson({
        fetchImpl,
        backendUrl: resolvedBackendUrl,
        deviceToken: resolvedDeviceToken,
        path: `/v1/personas/${encodeURIComponent(safeSlug)}`,
      });
    },

    createManagedPersona({
      slug,
      name,
      description,
      templateType = 'persona-app',
      promptTemplateVersion = 'v1',
    }) {
      const safeName = trimString(name);
      if (!safeName) {
        throw new Error('Persona name is required.');
      }

      const body = withDevice({
        name: safeName,
        description: trimString(description) || safeName,
        templateType: trimString(templateType) || 'persona-app',
        promptTemplateVersion: trimString(promptTemplateVersion) || 'v1',
      });
      const safeSlug = trimString(slug);
      if (safeSlug) {
        body.slug = safeSlug;
      }

      return postJson({
        fetchImpl,
        backendUrl: resolvedBackendUrl,
        deviceToken: resolvedDeviceToken,
        path: '/v1/personas/managed_create',
        body,
      });
    },

    registerRuntime({
      slug,
      endpoint,
      healthcheckUrl,
      transport = 'local',
      localPort,
      startedAt,
    }) {
      const safeSlug = trimString(slug);
      if (!safeSlug) {
        throw new Error('Persona slug is required.');
      }

      return postJson({
        fetchImpl,
        backendUrl: resolvedBackendUrl,
        deviceToken: resolvedDeviceToken,
        path: `/v1/personas/${encodeURIComponent(safeSlug)}/runtime_register`,
        body: withDevice({
          endpoint,
          healthcheckUrl,
          transport,
          localPort,
          startedAt,
        }),
      });
    },

    heartbeatRuntime({
      slug,
      endpoint,
      healthcheckUrl,
      transport = 'local',
      localPort,
      observedAt,
    }) {
      const safeSlug = trimString(slug);
      if (!safeSlug) {
        throw new Error('Persona slug is required.');
      }

      return postJson({
        fetchImpl,
        backendUrl: resolvedBackendUrl,
        deviceToken: resolvedDeviceToken,
        path: `/v1/personas/${encodeURIComponent(safeSlug)}/heartbeat`,
        body: withDevice({
          endpoint,
          healthcheckUrl,
          transport,
          localPort,
          observedAt,
        }),
      });
    },

    failRuntime({
      slug,
      code,
      message,
    }) {
      const safeSlug = trimString(slug);
      if (!safeSlug) {
        throw new Error('Persona slug is required.');
      }

      return postJson({
        fetchImpl,
        backendUrl: resolvedBackendUrl,
        deviceToken: resolvedDeviceToken,
        path: `/v1/personas/${encodeURIComponent(safeSlug)}/fail`,
        body: withDevice({
          code,
          message,
        }),
      });
    },

    startJob({
      jobId,
      startedAt,
    }) {
      const safeJobId = trimString(jobId);
      if (!safeJobId) {
        throw new Error('Persona job id is required.');
      }

      return postJson({
        fetchImpl,
        backendUrl: resolvedBackendUrl,
        deviceToken: resolvedDeviceToken,
        path: `/v1/persona_jobs/${encodeURIComponent(safeJobId)}/start`,
        body: withDevice({
          startedAt,
        }),
      });
    },

    succeedJob({
      jobId,
      workspacePath,
      localPort,
      transport = 'local',
      endpoint,
      healthcheckUrl,
      completedAt,
    }) {
      const safeJobId = trimString(jobId);
      if (!safeJobId) {
        throw new Error('Persona job id is required.');
      }

      return postJson({
        fetchImpl,
        backendUrl: resolvedBackendUrl,
        deviceToken: resolvedDeviceToken,
        path: `/v1/persona_jobs/${encodeURIComponent(safeJobId)}/succeed`,
        body: withDevice({
          workspacePath,
          localPort,
          transport,
          endpoint,
          healthcheckUrl,
          completedAt,
        }),
      });
    },

    failJob({
      jobId,
      code,
      message,
      completedAt,
    }) {
      const safeJobId = trimString(jobId);
      if (!safeJobId) {
        throw new Error('Persona job id is required.');
      }

      return postJson({
        fetchImpl,
        backendUrl: resolvedBackendUrl,
        deviceToken: resolvedDeviceToken,
        path: `/v1/persona_jobs/${encodeURIComponent(safeJobId)}/fail`,
        body: withDevice({
          code,
          message,
          completedAt,
        }),
      });
    },
  };
}
