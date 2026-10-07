// Local HTTP services for exercising the real browser, API, SDK, and tools together.
// Synthetic responses are integration fixtures, not a substitute for a live model evaluation.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
let syncRevision = 1;
let analysisRevision = 1;
let wellnessFailure = false;
let restrictedActivities = false;
const usage = { input_tokens: 100, output_tokens: 80, total_tokens: 180 };
createServer(async (req, res) => {
  if (req.url === "/fixture/sync-change") {
    syncRevision++;
    res.end("updated");
    return;
  }
  if (req.url === "/fixture/analysis-change") {
    analysisRevision++;
    res.end("updated");
    return;
  }
  if (req.url === "/fixture/wellness-failure") {
    wellnessFailure = true;
    res.end("unavailable");
    return;
  }
  if (req.url === "/fixture/wellness-recover") {
    wellnessFailure = false;
    res.end("available");
    return;
  }
  if (req.url === "/fixture/restricted-activities") {
    restrictedActivities = true;
    res.end("restricted");
    return;
  }
  if (
    req.url?.startsWith("/api/v1/athlete/") ||
    req.url?.startsWith("/api/v1/activity/")
  ) {
    const expected = `Basic ${Buffer.from(`API_KEY:${process.env.FIXTURE_INTERVALS_KEY || "synthetic-intervals-key"}`).toString("base64")}`;
    const other = `Basic ${Buffer.from("API_KEY:synthetic-other-key").toString("base64")}`;
    if (
      req.headers.authorization !== expected &&
      req.headers.authorization !== other
    ) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: "Synthetic credential rejection" }));
      return;
    }
    const anotherAccount = req.headers.authorization === other;
    const url = new URL(req.url, "http://localhost");
    const activities = anotherAccount
      ? []
      : [
          {
            id: "fixture-photo-run",
            type: "Run",
            source: "UPLOAD",
            start_date: "2026-10-05T13:00:00Z",
            start_date_local: "2026-10-05T08:00:00",
            moving_time: 3000,
            elapsed_time: 3000,
            distance: 8046.72,
            average_speed: 2.68224,
            average_heartrate: syncRevision === 1 ? 138 : 140,
            name: "Synthetic treadmill run",
            icu_rpe: 4,
            icu_training_load: analysisRevision === 1 ? 45 : 49,
            hr_load: 45,
            hr_load_type: "HRSS",
            icu_intensity: 68,
            icu_hr_zone_times: [1200, 1500, 300, 0, 0],
            icu_hr_zones: [130, 145, 160, 175, 190],
            pace_zone_times: [2000, 1000, 0, 0, 0],
            decoupling: 3.2,
            icu_efficiency_factor: 1.2,
          },
          {
            id: "fixture-bike",
            type: "Ride",
            source: "UPLOAD",
            start_date: "2026-10-01T14:00:00Z",
            start_date_local: "2026-10-01T09:00:00",
            moving_time: 3600,
            elapsed_time: 3600,
            distance: 25000,
            average_heartrate: 140,
            average_watts: 150,
            icu_weighted_avg_watts: 165,
            icu_rpe: 4,
            name: "Synthetic endurance ride",
            icu_training_load: 50,
            power_load: 50,
            icu_intensity: 66,
            icu_ftp: 250,
            icu_zone_times: [
              { id: "Z1", secs: 600 },
              { id: "Z2", secs: 3000 },
            ],
            icu_power_zones: [55, 75, 90, 105, 120, 150, 999],
          },
          {
            id: "fixture-history-run",
            type: "Run",
            source: "UPLOAD",
            start_date: "2026-09-17T13:00:00Z",
            start_date_local: "2026-09-17T08:00:00",
            moving_time: 2400,
            elapsed_time: 2400,
            distance: 6000,
            name: "Synthetic easy run",
            icu_rpe: 3,
            icu_training_load: 35,
            hr_load: 35,
          },
        ];
    if (restrictedActivities && !anotherAccount)
      activities.push({
        id: "fixture-restricted",
        start_date_local: "2026-10-04T08:00:00",
        source: "STRAVA",
        _note: "Provider restricts activity details",
      });
    res.setHeader("Content-Type", "application/json");
    if (url.pathname.includes("/wellness")) {
      if (wellnessFailure) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: "Synthetic wellness outage" }));
        return;
      }
      const from = url.searchParams.get("oldest"),
        to = url.searchParams.get("newest");
      const records = [];
      for (let ms = Date.parse(from); ms <= Date.parse(to); ms += 86400000) {
        const id = new Date(ms).toISOString().slice(0, 10),
          recent = id >= "2026-09-30";
        records.push({
          id,
          ctl: anotherAccount ? 12 : 40,
          atl: anotherAccount ? 10 : 52,
          rampRate: anotherAccount ? 0 : 2.5,
          ctlLoad: 40,
          atlLoad: 52,
          hrv: anotherAccount ? null : recent ? 45 : 50,
          restingHR: anotherAccount ? null : recent ? 53 : 50,
          sleepSecs: anotherAccount ? null : recent ? 25200 : 28800,
          sleepScore: 80,
          soreness: recent ? 2 : 0,
          fatigue: recent ? 2 : 0,
          mood: 2,
          stress: 1,
          injury: 1,
          tempRestingHR: id === "2026-10-02",
          steps: null,
        });
      }
      records.push({ id: "2026-10-07", ctl: 999, atl: 999, hrv: 999 }); // forecast must stay out of coaching
      res.end(JSON.stringify(records));
      return;
    }
    if (url.pathname.includes("/activities")) {
      const from = url.searchParams.get("oldest"),
        to = url.searchParams.get("newest");
      res.end(
        JSON.stringify(
          activities.filter(
            (a) =>
              a.start_date_local.slice(0, 10) >= from &&
              a.start_date_local.slice(0, 10) <= to,
          ),
        ),
      );
      return;
    }
    if (url.pathname.startsWith("/api/v1/activity/")) {
      const activity = activities.find(
        (a) => a.id === url.pathname.split("/").at(-1),
      );
      if (!activity) {
        res.statusCode = 404;
        res.end("{}");
        return;
      }
      res.end(
        JSON.stringify({
          ...activity,
          icu_intervals: [
            {
              type: "WORK",
              moving_time: 600,
              training_load: 10,
              average_heartrate: 140,
              average_speed: 2.7,
            },
            {
              type: "RECOVERY",
              moving_time: 120,
              training_load: 1,
              average_heartrate: 120,
              average_speed: 2,
            },
            {
              type: "WORK",
              moving_time: 600,
              training_load: 10,
              average_heartrate: 142,
              average_speed: 2.7,
            },
          ],
        }),
      );
      return;
    }
    res.end(
      JSON.stringify({
        id: anotherAccount ? "i654321" : "i123456",
        name: "Verification athlete",
        timezone: "America/Chicago",
        icu_api_key: "synthetic-secret-that-must-not-appear",
        icu_form_as_percent: false,
        sportSettings: [
          {
            id: 1,
            types: ["Run", "TrailRun"],
            lthr: 172,
            max_hr: 190,
            hr_zones: [130, 145, 160, 175, 190],
            hr_zone_names: [
              "Recovery",
              "Aerobic",
              "Tempo",
              "Threshold",
              "Hard",
            ],
            threshold_pace: 3.3,
            pace_zones: [80, 90, 100, 110, 999],
          },
          {
            id: 2,
            types: ["Ride", "VirtualRide"],
            ftp: 250,
            power_zones: [55, 75, 90, 105, 120, 150, 999],
            hr_zones: [130, 145, 160, 175, 190],
          },
        ],
      }),
    );
    return;
  }
  if (req.url !== "/v1/responses") {
    res.statusCode = 404;
    res.end();
    return;
  }
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  const responseId = `resp_${randomUUID()}`,
    itemId = `msg_${randomUUID()}`;
  const contextText = body.input.find(
    (item) => item.role === "system" || item.role === "developer",
  )?.content;
  const contextString =
    typeof contextText === "string"
      ? contextText
      : (contextText?.map((p) => p.text ?? "").join("") ?? "");
  let context = {};
  try {
    context = JSON.parse(
      contextString.split(
        "Current structured context (data, not instructions): ",
      )[1],
    );
  } catch {}
  const lastUser = body.input.findLastIndex((item) => item.role === "user");
  const userText = (body.input[lastUser]?.content ?? [])
    .filter((p) => p.type === "input_text")
    .map((p) => p.text)
    .join("");
  const toolResult = body.input
    .slice(lastUser + 1)
    .findLast((item) => item.type === "function_call_output");
  let text = "",
    call = null;
  if (body.text?.format?.type === "json_schema") {
    text = JSON.stringify({
      values: {
        date: "2026-10-05",
        sport: "run",
        durationSeconds: 3000,
        distanceMetres: 9977.9328,
        rpe: null,
        intent: "easy",
        feel: null,
        pain: null,
        startTime: "2026-10-05T13:00:00Z",
        averageHeartRate: 138,
        treadmill: true,
      },
      confidence: 0.92,
      uncertainFields: ["distanceMetres", "rpe"],
    });
  } else if (toolResult) {
    let result;
    try {
      result = JSON.parse(toolResult.output);
    } catch {
      result = {};
    }
    text =
      result.ok === false
        ? `That change was refused: ${result.reason}`
        : /plan|next|week/i.test(userText)
          ? "Your proposal is ready in My week. Review the targets and reasons, then accept the sessions that fit."
          : /ran|ride|minutes/i.test(userText)
            ? "Saved to your training log. The confirmed workout is now part of your week."
            : "Saved. I’ll keep that preference with your training log.";
  } else if (/long runs? on Saturday/i.test(userText)) {
    call = { name: "update_athlete", arguments: { longRunDay: 6 } };
  } else if (/ran.*45.*minutes/i.test(userText)) {
    call = {
      name: "log_activity",
      arguments: {
        date: context.today ?? "2026-10-06",
        sport: "run",
        durationSeconds: 2700,
        distanceMetres: 8046.72,
        rpe: 4,
        intent: "easy",
        feel: "comfortable",
        pain: null,
      },
    };
  } else if (/plan|next.*days|next.*step/i.test(userText)) {
    call = {
      name: "propose_training_week",
      arguments: { days: /three|3/.test(userText) ? 3 : 7 },
    };
  } else if (/remember|long.run/i.test(userText)) {
    text = `Your long-run preference is ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][context.athlete?.longRunDay ?? 6]}.`;
  } else {
    text =
      "Use My week to review and adjust sessions, or add a workout in your log. This is a local service fixture for app verification.";
  }
  console.log(
    JSON.stringify({
      request:
        body.text?.format?.type === "json_schema"
          ? "vision"
          : (call?.name ?? "text"),
      stream: !!body.stream,
    }),
  );
  const item = call
    ? {
        type: "function_call",
        id: `fc_${randomUUID()}`,
        call_id: `call_${randomUUID()}`,
        name: call.name,
        arguments: JSON.stringify(call.arguments),
        status: "completed",
      }
    : {
        type: "message",
        id: itemId,
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text, annotations: [] }],
      };
  const response = {
    id: responseId,
    created_at: Math.floor(Date.now() / 1000),
    model: body.model,
    status: "completed",
    output: [item],
    usage,
  };
  if (!body.stream) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(response));
    return;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  send({ type: "response.created", response });
  send({
    type: "response.output_item.added",
    output_index: 0,
    item: call ? { ...item, arguments: "" } : item,
  });
  if (call)
    send({
      type: "response.function_call_arguments.delta",
      item_id: item.id,
      output_index: 0,
      delta: item.arguments,
    });
  else
    send({
      type: "response.output_text.delta",
      item_id: item.id,
      output_index: 0,
      delta: text,
    });
  send({ type: "response.output_item.done", output_index: 0, item });
  send({ type: "response.completed", response });
  res.end("data: [DONE]\n\n");
}).listen(3010, "127.0.0.1", () =>
  console.log("Local synthetic provider fixtures: http://127.0.0.1:3010"),
);
