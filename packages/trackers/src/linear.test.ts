import { afterEach, describe, expect, it, vi } from "vitest";
import { LinearTrackerAdapter } from "./linear.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("Linear webhook helpers", () => {
  it("lists webhooks through the Linear GraphQL API", async () => {
    const fetchMock = mockLinearResponse({
      webhooks: {
        nodes: [
          {
            id: "wh_1",
            label: "Agentic PM PRA",
            url: "https://example.com/webhooks/linear",
            enabled: true,
            resourceTypes: ["Issue"],
            allPublicTeams: false,
            team: { id: "team_1", key: "PRA", name: "Prasan" },
          },
        ],
      },
    });
    const adapter = new LinearTrackerAdapter({ apiKey: "lin_api_test" });

    const webhooks = await adapter.listWebhooks();

    expect(webhooks).toHaveLength(1);
    expect(webhooks[0]?.id).toBe("wh_1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.linear.app/graphql",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "lin_api_test" }),
      }),
    );
  });

  it("creates a team-scoped webhook with the configured secret", async () => {
    const fetchMock = mockLinearResponse({
      webhookCreate: {
        success: true,
        webhook: {
          id: "wh_2",
          label: "Agentic PM PRA",
          url: "https://example.com/webhooks/linear",
          enabled: true,
          resourceTypes: ["Issue"],
          allPublicTeams: false,
          team: { id: "team_1", key: "PRA", name: "Prasan" },
        },
      },
    });
    const adapter = new LinearTrackerAdapter({ apiKey: "lin_api_test" });

    await adapter.createWebhook({
      label: "Agentic PM PRA",
      resourceTypes: ["Issue"],
      secret: "local_secret",
      teamId: "team_1",
      url: "https://example.com/webhooks/linear",
    });

    const body = readRequestBody(fetchMock);
    expect(body.variables.input).toMatchObject({
      label: "Agentic PM PRA",
      resourceTypes: ["Issue"],
      secret: "local_secret",
      teamId: "team_1",
      url: "https://example.com/webhooks/linear",
    });
  });

  it("updates an existing webhook without undefined fields", async () => {
    const fetchMock = mockLinearResponse({
      webhookUpdate: {
        success: true,
        webhook: {
          id: "wh_3",
          label: "Agentic PM PRA",
          url: "https://new.example.com/webhooks/linear",
          enabled: true,
          resourceTypes: ["Issue"],
          allPublicTeams: false,
          team: { id: "team_1", key: "PRA", name: "Prasan" },
        },
      },
    });
    const adapter = new LinearTrackerAdapter({ apiKey: "lin_api_test" });

    await adapter.updateWebhook("wh_3", {
      enabled: true,
      label: undefined,
      resourceTypes: ["Issue"],
      url: "https://new.example.com/webhooks/linear",
    });

    const body = readRequestBody(fetchMock);
    expect(body.variables).toMatchObject({
      id: "wh_3",
      input: {
        enabled: true,
        resourceTypes: ["Issue"],
        url: "https://new.example.com/webhooks/linear",
      },
    });
    expect(body.variables.input).not.toHaveProperty("label");
  });
});

function mockLinearResponse(data: unknown) {
  const fetchMock = vi.fn(async () => {
    return new Response(JSON.stringify({ data }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function readRequestBody(fetchMock: { mock: { calls: unknown[][] } }) {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body));
}
