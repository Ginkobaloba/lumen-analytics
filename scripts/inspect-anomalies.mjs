// Quick inspection of attribution output for the scripted anomalies.
import Database from "better-sqlite3";

const db = new Database("data/lumen.db", { readonly: true });
const rows = db
  .prepare(
    `SELECT metric_id, title, summary, attribution, suggested_actions
     FROM anomalies
     WHERE metric_id IN ('churn_rate', 'expansion_mrr', 'feature_adoption_api')
       AND severity IN ('high', 'critical')`,
  )
  .all();

for (const r of rows) {
  console.log("==", r.metric_id, "|", r.title);
  console.log(r.summary);
  const top = JSON.parse(r.attribution).slice(0, 4);
  console.log(
    "top slices:",
    top
      .map(
        (a) =>
          `${a.dimension}=${a.value} z=${a.meanZ} lift=${(a.lift * 100).toFixed(0)}%` +
          (a.contributionShare !== null ? ` share=${a.contributionShare}` : ""),
      )
      .join(" | "),
  );
  console.log("action:", JSON.parse(r.suggested_actions)[0]);
  console.log();
}
db.close();
