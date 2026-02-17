function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function normalizeName(name) {
  const clean = String(name || "").trim();
  return clean || "Anonymous";
}

function normalizeDescription(description) {
  return String(description || "").trim();
}

function normalizeStars(stars) {
  const value = Number(stars);
  return Number.isInteger(value) ? value : NaN;
}

export async function onRequestGet(context) {
  try {
    const rows = await context.env.DB.prepare(
      `SELECT id, name, stars, description, created_at
       FROM customer_reviews
       ORDER BY datetime(created_at) DESC, id DESC`
    ).all();

    const reviews = (rows.results || []).map((row) => ({
      id: row.id,
      name: row.name,
      stars: row.stars,
      description: row.description,
      createdAt: row.created_at,
    }));

    return json({ success: true, reviews }, 200);
  } catch (error) {
    console.error("Error loading reviews:", error);
    return json({ error: "Failed to load reviews." }, 500);
  }
}

export async function onRequestPost(context) {
  let body = {};
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const stars = normalizeStars(body.stars);
  const description = normalizeDescription(body.description);
  const name = normalizeName(body.name);

  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return json({ error: "Please choose a star rating between 1 and 5." }, 400);
  }

  if (!description) {
    return json({ error: "Review description is required." }, 400);
  }

  if (description.length > 1200) {
    return json({ error: "Review description is too long." }, 400);
  }

  try {
    const inserted = await context.env.DB.prepare(
      `INSERT INTO customer_reviews (name, stars, description)
       VALUES (?, ?, ?)
       RETURNING id, name, stars, description, created_at`
    )
      .bind(name, stars, description)
      .first();

    return json(
      {
        success: true,
        review: {
          id: inserted.id,
          name: inserted.name,
          stars: inserted.stars,
          description: inserted.description,
          createdAt: inserted.created_at,
        },
      },
      201
    );
  } catch (error) {
    console.error("Error saving review:", error);
    return json({ error: "Failed to save review. Please try again later." }, 500);
  }
}
