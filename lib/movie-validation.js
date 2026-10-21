import { ApiError } from "./api-errors.js";
import { GENRES, SORT_OPTIONS, STATUSES } from "./movie-constants.js";

const editableFields = [
  "title",
  "year",
  "genre",
  "status",
  "rating",
  "description",
];

function validateText(value, label, maxLength, required = false) {
  if (typeof value !== "string") {
    throw new ApiError(`${label}: ожидается текст.`);
  }

  const result = value.trim();
  if (required && result.length === 0) {
    throw new ApiError(`${label}: заполните это поле.`);
  }
  if (result.length > maxLength) {
    throw new ApiError(`${label}: максимум ${maxLength} символов.`);
  }
  if (result.includes("\0")) {
    throw new ApiError(`${label}: недопустимый символ.`);
  }
  return result;
}

export function validateMovie(data, partial = false) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ApiError("Тело запроса должно быть JSON-объектом.");
  }

  const keys = Object.keys(data);
  if (keys.some((key) => !editableFields.includes(key))) {
    throw new ApiError("В запросе есть неизвестное или недоступное для изменения поле.");
  }
  if (partial && keys.length === 0) {
    throw new ApiError("Укажите хотя бы одно поле для изменения.");
  }

  const result = {};
  if (!partial || Object.hasOwn(data, "title")) {
    result.title = validateText(data.title, "Название", 100, true);
  }
  if (!partial || Object.hasOwn(data, "year")) {
    if (!Number.isInteger(data.year) || data.year < 1888 || data.year > 2100) {
      throw new ApiError("Год должен быть целым числом от 1888 до 2100.");
    }
    result.year = data.year;
  }
  if (!partial || Object.hasOwn(data, "genre")) {
    if (!GENRES.includes(data.genre)) {
      throw new ApiError("Выберите жанр из списка.");
    }
    result.genre = data.genre;
  }
  if (!partial || Object.hasOwn(data, "status")) {
    const status = data.status === undefined ? "planned" : data.status;
    if (!STATUSES.includes(status)) {
      throw new ApiError("Неизвестный статус просмотра.");
    }
    result.status = status;
  }
  if (!partial || Object.hasOwn(data, "rating")) {
    const rating = data.rating === undefined ? null : data.rating;
    if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 10)) {
      throw new ApiError("Оценка должна быть целым числом от 1 до 10 или null.");
    }
    result.rating = rating;
  }
  if (!partial || Object.hasOwn(data, "description")) {
    const description = data.description === undefined ? "" : data.description;
    result.description = validateText(description, "Заметка", 1000);
  }

  return result;
}

export function validateMovieId(value) {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new ApiError("ID фильма должен быть положительным целым числом.");
  }
  return Number(value);
}

export function validateFilters(searchParams) {
  const q = (searchParams.get("q") || "").trim();
  const genre = searchParams.get("genre") || "";
  const status = searchParams.get("status") || "";
  const sort = searchParams.get("sort") || "newest";

  if (q.length > 100) {
    throw new ApiError("Поисковый запрос не должен превышать 100 символов.");
  }
  if (genre && !GENRES.includes(genre)) {
    throw new ApiError("Неизвестный жанр в фильтре.");
  }
  if (status && !STATUSES.includes(status)) {
    throw new ApiError("Неизвестный статус в фильтре.");
  }
  if (!SORT_OPTIONS.includes(sort)) {
    throw new ApiError("Неизвестный способ сортировки.");
  }
  return { q, genre, status, sort };
}
