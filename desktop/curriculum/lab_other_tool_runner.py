"""The same lab agent written with the SDK's tool runner. For reading only.

The tool runner is a part of the anthropic SDK (in beta) that does the loop for you. Compare it
with your agent and notice what has disappeared:

  - there is no `tools` list: @beta_tool builds each definition from the function's name,
    its type hints (sensor_id: str) and its docstring
  - there is no run_tool: the runner calls the function Claude asked for
  - there is no tool_result code and no while loop: the runner sends results back and
    keeps going until Claude stops asking for tools

It needs the real client, so it is not run in this course. Knowing your own loop is what lets
you read this and know what it is doing for you.
"""
import anthropic
from anthropic import beta_tool

client = anthropic.Anthropic()
RULES = "You are a careful lab assistant. Report only what the instruments return."


@beta_tool
def read_balance() -> str:
    """Read the mass currently on the lab balance, as text such as '+ 2.1319 g'."""
    return "+ 2.1319 g"


@beta_tool
def check_temperature(sensor_id: str) -> str:
    """Read one temperature sensor and return the temperature in degrees C.

    Args:
        sensor_id: The ID of the sensor to read, for example TEMP02.
    """
    return f"{sensor_id}: 22.4 C"


question = input("You: ")
runner = client.beta.messages.tool_runner(
    model="claude-opus-5-5",
    max_tokens=1024,
    system=RULES,
    tools=[read_balance, check_temperature],
    messages=[{"role": "user", "content": question}],
)

# Each message is one reply from Claude. Between them the runner has run the requested tools
# and sent their results back. The loop ends when Claude has finished.
for message in runner:
    for block in message.content:
        if block.type == "text":
            print("Agent:", block.text)
