import { deleteMovie, getMovie, updateMovie } from "../../../../lib/database.js";
import { ApiError, assertSameOrigin, errorResponse, readJsonBody } from "../../../../lib/api-errors.js";
import { validateMovie, validateMovieId } from "../../../../lib/movie-validation.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const id = validateMovieId((await params).id);
    const movie = getMovie(id);
    if (!movie) throw new ApiError("Фильм не найден.", 404);
    return Response.json({ movie });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    assertSameOrigin(request);
    const id = validateMovieId((await params).id);
    const changes = validateMovie(await readJsonBody(request), true);
    const movie = updateMovie(id, changes);
    if (!movie) throw new ApiError("Фильм не найден.", 404);
    return Response.json({ movie });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    assertSameOrigin(request);
    const id = validateMovieId((await params).id);
    if (!deleteMovie(id)) throw new ApiError("Фильм не найден.", 404);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
