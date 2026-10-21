export class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function errorResponse(error) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  // Подробности нужны разработчику в терминале, но не посетителю сайта.
  console.error("Ошибка MovieList API:", error);
  return Response.json(
    { error: "Не удалось выполнить запрос. Попробуйте ещё раз." },
    { status: 500 },
  );
}

export function assertSameOrigin(request) {
  const origin = request.headers.get("origin");

  // curl, тесты и другие серверные клиенты могут не передавать Origin.
  if (!origin) return;

  let allowed = false;
  try {
    const source = new URL(origin);
    // Next.js может подставить адрес bind (0.0.0.0) в request.url.
    // Host содержит адрес, к которому действительно обратился браузер.
    const host = request.headers.get("host") || new URL(request.url).host;
    const validProtocol = source.protocol === "http:" || source.protocol === "https:";
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
  if (!allowed) throw new ApiError("Запрос с другого сайта запрещён.", 403);
}

export async function readJsonBody(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ApiError("Передайте данные в формате application/json.", 415);
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).length > 16_384) {
    throw new ApiError("Размер запроса превышает 16 КБ.", 413);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("В запросе передан некорректный JSON.");
  }
}
