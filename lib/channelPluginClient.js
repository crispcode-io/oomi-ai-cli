function trimString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stripTrailingSlash(value) {
  return trimString(value).replace(/\/+$/, '');
}

async function readJsonResponse(response) {
  return response.json().catch(() => ({}));
}

async function requestJson({
  fetchImpl,
  backendUrl,
  path,
  deviceToken,
  method = 'POST',
  body,
}) {
  const baseUrl = stripTrailingSlash(backendUrl);
  if (!baseUrl) {
    throw new Error('Backend URL is required.');
  }
  const token = trimString(deviceToken);
  if (!token) {
    throw new Error('Device token is required.');
  }

  const response = await fetchImpl(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    const errorMessage =
      trimString(payload?.error) ||
      trimString(payload?.message) ||
      `Channel plugin request failed (${response.status})`;
    throw new Error(errorMessage);
  }

  return payload;
}

export function createChannelPluginClient({
  backendUrl,
  deviceToken,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch implementation is required.');
  }

  const resolvedBackendUrl = stripTrailingSlash(backendUrl);
  const resolvedDeviceToken = trimString(deviceToken);

  return {
    pollMessages({
      limit = 20,
      metadataType,
    } = {}) {
      const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(100, Math.floor(Number(limit)))) : 20;
      const payload = { limit: safeLimit };
      const safeMetadataType = trimString(metadataType);
      if (safeMetadataType) {
        payload.metadataType = safeMetadataType;
      }

      return requestJson({
        fetchImpl,
        backendUrl: resolvedBackendUrl,
        deviceToken: resolvedDeviceToken,
        path: '/v1/channel/plugin/poll',
        method: 'POST',
        body: payload,
      });
    },

    ackMessage({
      messageId,
      outcome = 'delivered',
      failureCode,
    }) {
      const safeMessageId = trimString(messageId);
      if (!safeMessageId) {
        throw new Error('Channel message id is required.');
      }

      const safeOutcome = trimString(outcome) || 'delivered';
      if (safeOutcome !== 'delivered' && safeOutcome !== 'failed') {
        throw new Error('Ack outcome must be delivered or failed.');
      }

      const body = {
        messageId: safeMessageId,
        outcome: safeOutcome,
      };
      const safeFailureCode = trimString(failureCode);
      if (safeFailureCode) {
        body.failureCode = safeFailureCode;
      }

      return requestJson({
        fetchImpl,
        backendUrl: resolvedBackendUrl,
        deviceToken: resolvedDeviceToken,
        path: '/v1/channel/plugin/acks',
        method: 'POST',
        body,
      });
    },
  };
}
