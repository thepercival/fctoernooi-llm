// Copyright (c) Microsoft. All rights reserved.

using Azure.AI.AgentServer.Core;
using Azure.AI.Projects;
using Azure.Identity;
using DotNetEnv;
using Microsoft.Agents.AI;
using Microsoft.Agents.AI.Foundry.Hosting;

Env.NoClobber().TraversePath().Load();

var projectEndpoint = new Uri(Environment.GetEnvironmentVariable("FOUNDRY_PROJECT_ENDPOINT")
    ?? throw new InvalidOperationException("FOUNDRY_PROJECT_ENDPOINT environment variable is not set."));
var deployment = Environment.GetEnvironmentVariable("AZURE_AI_MODEL_DEPLOYMENT_NAME") ?? "gpt-5-mini";

// Managed Identity is only reachable when actually hosted in Azure (workload identity
// federation). Outside of that, its IMDS probe times out and — unlike a normal
// "unavailable" credential — surfaces as a hard failure that aborts the whole
// DefaultAzureCredential chain instead of falling through to the CLI login.
var isHostedInAzure = Environment.GetEnvironmentVariable("IDENTITY_ENDPOINT") is not null
    || Environment.GetEnvironmentVariable("MSI_ENDPOINT") is not null
    || Environment.GetEnvironmentVariable("AZURE_FEDERATED_TOKEN_FILE") is not null;
var credential = new DefaultAzureCredential(new DefaultAzureCredentialOptions
{
    ExcludeManagedIdentityCredential = !isHostedInAzure,
});

AIAgent agent = new AIProjectClient(projectEndpoint, credential)
    .AsAIAgent(
        model: deployment,
        instructions: """
            You are the FCToernooi assistant. You help logged-in users organize and manage
            their tournaments — competitors, schedules, results, and settings.
            Be concise, clear, and helpful in your responses.
            """,
        name: "fctoernooi-chat-agent",
        description: "AI assistant for fctoernooi tournament data and support");

var builder = AgentHost.CreateBuilder(args);
builder.Services.AddFoundryResponses(agent);
builder.RegisterProtocol("responses", endpoints => endpoints.MapFoundryResponses());

var app = builder.Build();
app.Run();
