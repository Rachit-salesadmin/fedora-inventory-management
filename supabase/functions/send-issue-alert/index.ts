const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured.");
    }

    const payload = await req.json();
    const to = (Deno.env.get("ISSUE_ALERT_TO") || "sales.admin@fedorawallpapers.com")
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);
    const from = Deno.env.get("ISSUE_ALERT_FROM") || "Fedora Inventory <onboarding@resend.dev>";
    const screenshots = Array.isArray(payload.screenshotUrls) ? payload.screenshotUrls : [];
    const screenshotLinks = screenshots.length
      ? screenshots
          .map((url: string, index: number) => `<li><a href="${escapeHtml(url)}">Screenshot ${index + 1}</a></li>`)
          .join("")
      : "<li>No screenshots attached.</li>";

    const html = `
      <h2>Fedora Inventory Issue Report</h2>
      <p><strong>Title:</strong> ${escapeHtml(payload.title || "Issue Report")}</p>
      <p><strong>Page:</strong> ${escapeHtml(payload.page || "-")}</p>
      <p><strong>Warehouse:</strong> ${escapeHtml(payload.warehouse || "-")}</p>
      <p><strong>Reported by:</strong> ${escapeHtml(payload.reporterName || "-")}</p>
      <p><strong>Role:</strong> ${escapeHtml(payload.reporterRole || "-")}</p>
      <p><strong>Email:</strong> ${escapeHtml(payload.reporterEmail || "-")}</p>
      <p><strong>Issue ID:</strong> ${escapeHtml(payload.issueId || "-")}</p>
      <hr>
      <p>${escapeHtml(payload.description || "").replaceAll("\n", "<br>")}</p>
      <h3>Screenshots</h3>
      <ul>${screenshotLinks}</ul>
    `;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: `Fedora Inventory Issue: ${payload.title || "Issue Report"}`,
        html,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Resend failed: ${details}`);
    }

    const data = await response.json();
    return new Response(JSON.stringify({ ok: true, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message || String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
