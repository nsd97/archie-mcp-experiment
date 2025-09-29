export function buildOpenApiSpec() {
  const spec: any = {
    openapi: '3.1.0',
    info: {
      title: 'ArchieOS Operations API',
      version: '1.0.0',
      description: 'OpenAPI 3.1 specification for Operations Center APIs',
    },
    servers: [{ url: 'http://localhost:3000' }],
    paths: {
      '/health': {
        get: { summary: 'Health check', operationId: 'getHealth', responses: { '200': { description: 'OK' } } },
      },
      '/v1/operations/listings': {
        get: { summary: 'List listings', operationId: 'listListings', responses: { '200': { description: 'OK' } } },
      },
      '/v1/operations/listings/{id}': {
        get: {
          summary: 'Get listing by id',
          operationId: 'getListingById',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'OK' }, '404': { description: 'Not Found' } },
        },
      },
      '/v1/operations/listings/{id}/details': {
        get: {
          summary: 'Get listing details',
          operationId: 'getListingDetails',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'OK' }, '404': { description: 'Not Found' } },
        },
      },
      '/v1/operations/queues': {
        get: { summary: 'Queue summary', operationId: 'getQueues', responses: { '200': { description: 'OK' } } },
      },
      '/v1/operations/queue': {
        get: { summary: 'Queue detail', operationId: 'getQueue', responses: { '200': { description: 'OK' } } },
      },
      '/v1/operations/tasks/{listingId}': {
        get: {
          summary: 'List tasks for a listing',
          operationId: 'listListingTasks',
          parameters: [{ name: 'listingId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'OK' } },
        },
      },
      // Implemented path variant in code
      '/v1/operations/tasks/task/{taskId}': {
        get: {
          summary: 'Get task by id (variant)',
          operationId: 'getTaskByIdVariant',
          parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'OK' }, '404': { description: 'Not Found' } },
        },
      },
      // Requested canonical path
      '/v1/operations/tasks/{taskId}': {
        get: {
          summary: 'Get task by id',
          operationId: 'getTaskById',
          parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'OK' }, '404': { description: 'Not Found' } },
        },
      },
      '/v1/operations/tasks/{taskId}/claim': {
        post: {
          summary: 'Claim task',
          operationId: 'claimTask',
          parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { assigneeId: { type: 'string' } }, required: ['assigneeId'] } } } },
          responses: { '200': { description: 'OK' } },
        },
      },
      '/v1/operations/tasks/{taskId}/unclaim': {
        post: {
          summary: 'Unclaim task', operationId: 'unclaimTask',
          parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'OK' } },
        },
      },
      '/v1/operations/tasks/{taskId}/complete': {
        post: {
          summary: 'Complete task', operationId: 'completeTask',
          parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'OK' } },
        },
      },
      '/v1/operations/my-tasks': {
        get: { summary: 'My tasks', operationId: 'getMyTasks', responses: { '200': { description: 'OK' } } },
      },
      '/v1/operations/stray-queues': {
        get: { summary: 'Stray queues', operationId: 'getStrayQueues', responses: { '200': { description: 'OK' } } },
      },
      '/v1/operations/board': {
        get: { summary: 'Board view', operationId: 'getBoard', responses: { '200': { description: 'OK' } } },
      },
      // Future endpoints (placeholders for spec completeness)
      '/v1/tasks/{task_id}/attachments/sign-put': {
        post: {
          summary: 'Placeholder - Sign S3 PUT for task attachment (not implemented)',
          operationId: 'signPutAttachment',
          parameters: [{ name: 'task_id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '501': { description: 'Not Implemented' } },
        },
      },
      '/files/sign-get': {
        post: {
          summary: 'Placeholder - Sign S3 GET (not implemented)',
          operationId: 'signGetFile',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { objectKey: { type: 'string' } }, required: ['objectKey'] } } } },
          responses: { '501': { description: 'Not Implemented' } },
        },
      },
      '/v1/listings/{id}/documents': {
        get: {
          summary: 'Placeholder - List listing documents (not implemented)',
          operationId: 'listListingDocuments',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '501': { description: 'Not Implemented' } },
        },
      },
      '/entities/me': {
        get: { summary: 'Get current entity', operationId: 'getMe', responses: { '200': { description: 'OK' } } },
      },
      '/entities/{id}': {
        get: {
          summary: 'Get entity by id', operationId: 'getEntity',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'OK' }, '404': { description: 'Not Found' } },
        },
      },
      '/entities': {
        get: {
          summary: 'Search entities by type and name',
          operationId: 'searchEntities',
          parameters: [
            { name: 'type', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'query', in: 'query', required: false, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'OK' } },
        },
      },
      '/slack/events': {
        post: {
          summary: 'Slack Events webhook',
          operationId: 'slackEvents',
          responses: { '200': { description: 'OK' }, '401': { description: 'Invalid signature' } },
        },
      },
      '/slack/interact': {
        post: {
          summary: 'Slack Interactivity webhook',
          operationId: 'slackInteract',
          parameters: [
            { name: 'X-Slack-Signature', in: 'header', required: true, schema: { type: 'string' } },
            { name: 'X-Slack-Request-Timestamp', in: 'header', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/x-www-form-urlencoded': {
                schema: {
                  type: 'object',
                  properties: {
                    payload: {
                      type: 'string',
                      description: 'JSON-encoded interactive payload'
                    }
                  },
                  required: ['payload']
                }
              }
            }
          },
          security: [{ slackSignature: [] }],
          responses: {
            '200': { description: 'OK' },
            '401': { description: 'Invalid signature' }
          },
        },
      },
    },
  };
  return spec;
}
