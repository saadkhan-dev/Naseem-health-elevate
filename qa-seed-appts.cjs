const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const envPath = path.join(__dirname, ".env");
const vars = {};
for (const l of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) vars[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}
if (!vars.VITE_SUPABASE_URL || !vars.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("missing env");
  process.exit(2);
}
const admin = createClient(vars.VITE_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const code = () =>
  "APT-" + Array.from({ length: 6 }, () => ALPHA[Math.floor(Math.random() * 32)]).join("");

(async () => {
  const pats = JSON.parse(
    fs.readFileSync(path.join(process.env.TEMP || "/tmp", "qa-patients.json"), "utf8"),
  );
  const a = pats.patients.find((p) => p.key === "A");
  const b = pats.patients.find((p) => p.key === "B");
  const svc = await admin.from("services").select("id, name, is_active").limit(20);
  console.log("services:", JSON.stringify(svc.data));
  const svcId = svc.data[0].id;

  const rows = [
    {
      patient_id: a.userId,
      patient_name: "QA Patient A",
      patient_phone: a.phone,
      patient_email: a.email,
      service_id: svcId,
      date: "2026-09-18",
      time: "10:00",
      status: "pending",
      appointment_no: code(),
    },
    {
      patient_id: b.userId,
      patient_name: "QA Patient B",
      patient_phone: b.phone,
      patient_email: b.email,
      service_id: svcId,
      date: "2026-09-19",
      time: "10:30",
      status: "pending",
      appointment_no: code(),
    },
  ];
  for (const r of rows) {
    const { data, error } = await admin
      .from("appointments")
      .insert(r)
      .select("id, appointment_no, date, time, status, patient_id, service_id")
      .single();
    if (error) {
      console.error("insert failed", error.message);
      process.exit(1);
    }
    console.log(JSON.stringify(data));
  }
  console.log("seeded");
})().catch((e) => {
  console.error("EXC", e.message);
  process.exit(1);
});
