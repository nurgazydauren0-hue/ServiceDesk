export class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function errorResponse(error) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  if (error?.code === 'P2002')
    return Response.json(
      { error: 'Такие данные уже используются. Проверьте email или название.' },
      { status: 409 },
    );
  if (error?.code === 'P2003')
    return Response.json(
      {
        error:
          'Запись связана с другими данными. Сначала измените связанные записи.',
      },
      { status: 409 },
    );
  if (error?.code === 'P2025')
    return Response.json({ error: 'Запись не найдена.' }, { status: 404 });
  if (error?.code === 'P2034')
    return Response.json(
      { error: 'Данные были изменены другим пользователем. Повторите запрос.' },
      { status: 409 },
    );
  if (
    ['P1000', 'P1001', 'P1002', 'P2021', 'P2022'].includes(error?.code) ||
    error?.name === 'PrismaClientInitializationError'
  ) {
    console.error(
      'База данных ServiceDesk недоступна:',
      error.code || error.name,
    );
    return Response.json(
      {
        error:
          'База данных временно недоступна. Проверьте подключение и миграции.',
      },
      { status: 503 },
    );
  }

  // Never expose SQL, credentials or stack traces to a client.
  console.error(
    'Ошибка ServiceDesk API:',
    error?.code || error?.name || 'UnknownError',
  );
  return Response.json(
    { error: 'Не удалось выполнить запрос. Попробуйте ещё раз.' },
    { status: 500 },
  );
}

export function assertSameOrigin(request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new ApiError('Запрос с другого сайта запрещён.', 403);
  }
  const origin = request.headers.get('origin');

  // curl, тесты и другие серверные клиенты могут не передавать Origin.
  if (!origin) return;

  let allowed = false;
  try {
    const source = new URL(origin);
    // Next.js может подставить адрес bind (0.0.0.0) в request.url.
    // Host содержит адрес, к которому действительно обратился браузер.
    const host = request.headers.get('host') || new URL(request.url).host;
    const validProtocol =
      source.protocol === 'http:' || source.protocol === 'https:';
    const validHost = !/[\s\\/@?#]/.test(host);

    if (validProtocol && validHost && source.origin === origin) {
      const destination = new URL(`${source.protocol}//${host}`);
      allowed = source.host === destination.host;
    }
  } catch {
    // Origin: null, произвольный текст и повреждённые URL не принимаются.
  }

  // Схему HTTP/HTTPS может менять доверенный reverse proxy при завершении TLS.
  // Это дополнительная проверка хоста, а не авторизация пользователя.
  if (!allowed) throw new ApiError('Запрос с другого сайта запрещён.', 403);
}

export async function readJsonBody(request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new ApiError('Передайте данные в формате application/json.', 415);
  }

  const limit = 16_384;
  if (Number(request.headers.get('content-length')) > limit) {
    throw new ApiError('Размер запроса превышает 16 КБ.', 413);
  }

  // Enforce the byte limit while reading, before buffering an untrusted body.
  const chunks = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (reader) {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
          await reader.cancel();
          throw new ApiError('Размер запроса превышает 16 КБ.', 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);

  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError('В запросе передан некорректный JSON.');
  }
}
