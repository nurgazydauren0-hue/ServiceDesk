import { createMovie, listMovies } from "../../../lib/database.js";
import { assertSameOrigin, errorResponse, readJsonBody } from "../../../lib/api-errors.js";
import { validateFilters, validateMovie } from "../../../lib/movie-validation.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const filters = validateFilters(new URL(request.url).searchParams);
    return Response.json({ movies: listMovies(filters) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const data = validateMovie(await readJsonBody(request));
    const movie = createMovie(data);
    return Response.json({ movie }, {
      status: 201,
      headers: { Location: `/api/movies/${movie.id}` },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
