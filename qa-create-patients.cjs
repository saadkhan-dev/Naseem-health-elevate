const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const envPath = path.join(__dirname, ".env");
const envLines = fs.readFileSync(envPath, "utf8").split("\n");
const vars = {};
for (const l of envLines) {
  const mm = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (mm) vars[mm[1]] = mm[2].trim().replace(/^"|"$/g, "");
}
const url = vars.VITE_SUPABASE_URL;
const serviceKey = vars.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("missing env");
  process.exit(2);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const stamp = "260926";
const A = {
  email: `qa.patient.a.${stamp}@example.com`,
  password: "PatientA#2026$strong",
  phone: "+920000000101",
  name: "QA Patient A",
};
const B = {
  email: `qa.patient.b.${stamp}@example.com`,
  password: "PatientB#2026$strong",
  phone: "+920000000102",
  name: "QA Patient B",
};

(async () => {
  const out = { patients: [] };
  for (const [key, p] of Object.entries({ A, B })) {
    // reuse if exists
    const existing = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const found = existing.data?.users?.find((u) => u.email === p.email);
    let userId = found?.id;
    if (!found) {
      const created = await admin.auth.admin.createUser({
        email: p.email,
        password: p.password,
        email_confirm: true,
        user_metadata: { full_name: p.name, phone: p.phone },
      });
      if (created.error) {
        console.error(`createUser ${key} FAILED`, created.error.message);
        process.exit(1);
      }
      userId = created.data.user.id;
    }
    const { error: perr } = await admin
      .from("profiles")
      .upsert(
        { id: userId, full_name: p.name, phone: p.phone, role: "patient" },
        { onConflict: "id" },
      );
    if (perr) {
      console.error(`profile ${key} FAILED`, perr.message);
      process.exit(1);
    }
    const prof = await admin
      .from("profiles")
      .select("id,full_name,phone,role")
      .eq("id", userId)
      .single();
    out.patients.push({ key, userId, email: p.email, phone: p.phone, role: prof.data?.role });
    console.log(`${key}: user=${userId} role=${prof.data?.role} email=${p.email} phone=${p.phone}`);
  }
  fs.writeFileSync(
    path.join(process.env.TEMP || "/tmp", "qa-patients.json"),
    JSON.stringify(out, null, 2),
  );
  console.log("saved to " + path.join(process.env.TEMP || "/tmp", "qa-patients.json"));
})().catch((e) => {
  console.error("EXC", e.message);
  process.exit(1);
});
