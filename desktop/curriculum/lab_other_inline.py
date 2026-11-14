"""Someone else's version of the same lab agent, written as one long loop. For reading only.

Nothing here is new: every part of your agent is present, under different names and in a
different arrangement. Find where each of your functions' jobs is done.
"""
import json

import fake_claude

llm = fake_claude.FakeClient()
MODEL = "claude-opus-5-5"
SYSTEM = "You are a careful lab assistant. Report only what the instruments return."


def weigh():
    return "+ 2.1319 g"


def temperature(sensor_id):
    return {"sensor_id": sensor_id, "temperature": 22.4, "unit": "C"}


# A dictionary from tool name to function, instead of if/elif.
HANDLERS = {
    "read_balance": lambda args: weigh(),
    "check_temperature": lambda args: json.dumps(temperature(args["sensor_id"])),
}

TOOL_SPECS = [
    {"name": "read_balance", "description": "Read the mass currently on the lab balance, as text such as '+ 2.1319 g'.", "input_schema": {"type": "object", "properties": {}}},
    {
        "name": "check_temperature",
        "description": "Read one temperature sensor by its ID and return the temperature in degrees C.",
        "input_schema": {"type": "object", "properties": {"sensor_id": {"type": "string"}}, "required": ["sensor_id"]},
    },
]

transcript = []
while True:
    line = input("> ")
    if line in ("quit", "exit"):
        break
    transcript.append({"role": "user", "content": line})
    while True:
        reply = llm.messages.create(model=MODEL, max_tokens=1024, system=SYSTEM, tools=TOOL_SPECS, messages=transcript)
        transcript.append({"role": "assistant", "content": reply.content})
        if reply.stop_reason != "tool_use":
            break
        outputs = []
        for part in reply.content:
            if part.type != "tool_use":
                continue
            handler = HANDLERS.get(part.name)
            if handler is None:
                outputs.append({"type": "tool_result", "tool_use_id": part.id, "content": "no such tool: " + part.name, "is_error": True})
                continue
            try:
                outputs.append({"type": "tool_result", "tool_use_id": part.id, "content": handler(part.input)})
            except Exception as problem:
                outputs.append({"type": "tool_result", "tool_use_id": part.id, "content": str(problem), "is_error": True})
        transcript.append({"role": "user", "content": outputs})
    print("".join(part.text for part in reply.content if part.type == "text"))
