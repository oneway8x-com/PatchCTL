"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@corely/ui";
import type {
  PatchSemanticType,
  SourceFieldConfiguration,
  SourceResourceConfiguration,
  SourceSchemaState,
} from "@corely/contracts";
import { patchClient } from "../patches-api";

type SemanticOverride = Exclude<PatchSemanticType, "unsupported">;
const semanticOptions: SemanticOverride[] = [
  "string",
  "text",
  "number",
  "boolean",
  "date",
  "datetime",
  "enum",
  "relation",
];

function initialConfiguration(
  source: SourceSchemaState,
): SourceResourceConfiguration[] {
  return source.resources.map((resource) => ({
    name: resource.name,
    managed: resource.managed,
    fields: resource.fields.map((field) => ({
      name: field.name,
      writable: field.writable,
      ...(field.semanticType ? { semanticType: field.semanticType } : {}),
      ...(field.semanticType === "enum" && field.effectiveEnumValues
        ? { enumValues: field.effectiveEnumValues }
        : {}),
      ...(field.semanticType === "relation" && field.effectiveRelation
        ? { relation: field.effectiveRelation }
        : {}),
    })),
  }));
}

export function SourceConfiguration({ sourceId }: { sourceId: string }) {
  const queryClient = useQueryClient();
  const source = useQuery({
    queryKey: ["patchctl-source", sourceId],
    queryFn: () => patchClient.sourceMetadata(sourceId),
    retry: false,
  });
  const [configuration, setConfiguration] = useState<
    SourceResourceConfiguration[]
  >([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (source.data) setConfiguration(initialConfiguration(source.data));
  }, [source.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!source.data) throw new Error("Source is unavailable.");
      return patchClient.configureSourceMetadata(sourceId, {
        expectedVersion: source.data.configurationVersion,
        resources: configuration,
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["patchctl-source", sourceId], updated);
      setConfiguration(initialConfiguration(updated));
      setMessage("Source configuration saved.");
    },
    onError: () =>
      setMessage("Configuration could not be saved. Reload and retry."),
  });

  const configuredByName = useMemo(
    () => new Map(configuration.map((resource) => [resource.name, resource])),
    [configuration],
  );

  function updateResource(
    resourceName: string,
    update: (
      resource: SourceResourceConfiguration,
    ) => SourceResourceConfiguration,
  ) {
    setMessage("");
    setConfiguration((current) =>
      current.map((resource) =>
        resource.name === resourceName ? update(resource) : resource,
      ),
    );
  }

  function updateField(
    resourceName: string,
    fieldName: string,
    update: (field: SourceFieldConfiguration) => SourceFieldConfiguration,
  ) {
    updateResource(resourceName, (resource) => ({
      ...resource,
      fields: resource.fields.map((field) =>
        field.name === fieldName ? update(field) : field,
      ),
    }));
  }

  if (source.isLoading) return <p role="status">Loading source schema…</p>;
  if (source.isError || !source.data)
    return (
      <Card className="mx-auto max-w-3xl">
        <CardHeader>
          <CardTitle>Source unavailable</CardTitle>
          <CardDescription>
            The source is missing or your active Tenant cannot access it.
          </CardDescription>
        </CardHeader>
      </Card>
    );

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">
          Source configuration
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {source.data.name}
        </h1>
        <p className="break-all font-mono text-sm text-muted-foreground">
          {source.data.id}
        </p>
        <p className="text-muted-foreground">
          Choose the resources agents may use, then explicitly enable writable
          fields. Unmanaged resources and new fields remain read-only by
          default.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Schema sync</CardTitle>
          <CardDescription>
            Only normalized schema metadata is stored here; connection strings,
            credentials, and row values remain local.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-muted-foreground">Fingerprint</dt>
              <dd className="mt-1 break-all font-mono text-xs">
                {source.data.schemaVersion ?? "Not synced"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Last synced</dt>
              <dd className="mt-1 text-sm">
                {source.data.syncedAt
                  ? new Date(source.data.syncedAt).toLocaleString()
                  : "Not synced"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">
                Configuration version
              </dt>
              <dd className="mt-1 text-sm">
                {source.data.configurationVersion}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {source.data.resources.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No schema metadata</CardTitle>
            <CardDescription>
              Run `patchctl login` after connecting PostgreSQL, or rerun
              `patchctl connect` for an already paired source.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="space-y-5">
        {source.data.resources.map((resource, resourceIndex) => {
          const configured = configuredByName.get(resource.name);
          if (!configured) return null;
          return (
            <Card
              key={resource.name}
              data-testid={`source-resource-${resource.name}`}
            >
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <CardTitle>{resource.name}</CardTitle>
                    <CardDescription>
                      Primary key: {resource.primaryKey ?? "unsupported"}
                    </CardDescription>
                  </div>
                  <Label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label={`Managed resource ${resource.name}`}
                      className="h-4 w-4"
                      checked={configured.managed}
                      disabled={!resource.primaryKey}
                      onChange={(event) =>
                        updateResource(resource.name, (current) => ({
                          ...current,
                          managed: event.target.checked,
                          fields: event.target.checked
                            ? current.fields
                            : current.fields.map((field) => ({
                                ...field,
                                writable: false,
                              })),
                        }))
                      }
                    />
                    Managed resource
                  </Label>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="p-2 font-medium">Field</th>
                      <th className="p-2 font-medium">Discovered type</th>
                      <th className="p-2 font-medium">Semantic override</th>
                      <th className="p-2 font-medium">
                        Enum / relation metadata
                      </th>
                      <th className="p-2 text-center font-medium">Writable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resource.fields.map((field, fieldIndex) => {
                      const fieldConfiguration = configured.fields.find(
                        (candidate) => candidate.name === field.name,
                      );
                      if (!fieldConfiguration) return null;
                      const effectiveType =
                        fieldConfiguration.semanticType ?? field.type;
                      const databaseReadonly =
                        field.databaseReadonly || field.primaryKey;
                      const writableDisabled =
                        !configured.managed ||
                        databaseReadonly ||
                        effectiveType === "unsupported";
                      const fieldControlId = `source-${resourceIndex}-field-${fieldIndex}`;
                      return (
                        <tr key={field.name} className="border-b align-top">
                          <td className="p-2">
                            <div className="font-medium">{field.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {field.nullable ? "nullable" : "required"}
                              {databaseReadonly ? " · database read-only" : ""}
                            </div>
                          </td>
                          <td className="p-2 font-mono text-xs">
                            {field.type}
                          </td>
                          <td className="p-2">
                            <Label
                              className="sr-only"
                              htmlFor={`${fieldControlId}-type`}
                            >
                              Semantic type for {resource.name} {field.name}
                            </Label>
                            <select
                              id={`${fieldControlId}-type`}
                              className="h-10 w-full rounded-md border bg-background px-3"
                              value={fieldConfiguration.semanticType ?? ""}
                              onChange={(event) => {
                                const semanticType = event.target.value as
                                  | SemanticOverride
                                  | "";
                                updateField(
                                  resource.name,
                                  field.name,
                                  (current) => ({
                                    name: current.name,
                                    writable:
                                      semanticType === ""
                                        ? false
                                        : current.writable,
                                    ...(semanticType ? { semanticType } : {}),
                                    ...(semanticType === "enum"
                                      ? {
                                          enumValues:
                                            current.enumValues ??
                                            field.effectiveEnumValues ??
                                            [],
                                        }
                                      : {}),
                                    ...(semanticType === "relation" &&
                                    (current.relation ??
                                      field.effectiveRelation)
                                      ? {
                                          relation:
                                            current.relation ??
                                            field.effectiveRelation,
                                        }
                                      : {}),
                                  }),
                                );
                              }}
                            >
                              <option value="">
                                Discovered ({field.type})
                              </option>
                              {semanticOptions.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            {effectiveType === "enum" ? (
                              <div
                                className="space-y-2"
                                role="group"
                                aria-label={`Enum values for ${resource.name} ${field.name}`}
                              >
                                {(
                                  fieldConfiguration.enumValues ??
                                  field.effectiveEnumValues ??
                                  []
                                ).map((enumValue, enumIndex, enumValues) => (
                                  <div
                                    key={enumIndex}
                                    className="flex items-center gap-2"
                                  >
                                    <Input
                                      id={`${fieldControlId}-enum-${enumIndex}`}
                                      aria-label={`Enum value ${enumIndex + 1} for ${resource.name} ${field.name}`}
                                      value={enumValue}
                                      onChange={(event) =>
                                        updateField(
                                          resource.name,
                                          field.name,
                                          (current) => {
                                            const values = [
                                              ...(current.enumValues ??
                                                field.effectiveEnumValues ??
                                                []),
                                            ];
                                            values[enumIndex] =
                                              event.target.value;
                                            return {
                                              ...current,
                                              semanticType: "enum",
                                              enumValues: values,
                                              relation: undefined,
                                            };
                                          },
                                        )
                                      }
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      aria-label={`Remove enum value ${enumIndex + 1} for ${resource.name} ${field.name}`}
                                      disabled={enumValues.length === 1}
                                      onClick={() =>
                                        updateField(
                                          resource.name,
                                          field.name,
                                          (current) => ({
                                            ...current,
                                            semanticType: "enum",
                                            enumValues: (
                                              current.enumValues ??
                                              field.effectiveEnumValues ??
                                              []
                                            ).filter(
                                              (_, index) => index !== enumIndex,
                                            ),
                                            relation: undefined,
                                          }),
                                        )
                                      }
                                    >
                                      Remove
                                    </Button>
                                  </div>
                                ))}
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() =>
                                    updateField(
                                      resource.name,
                                      field.name,
                                      (current) => ({
                                        ...current,
                                        semanticType: "enum",
                                        enumValues: [
                                          ...(current.enumValues ??
                                            field.effectiveEnumValues ??
                                            []),
                                          "",
                                        ],
                                        relation: undefined,
                                      }),
                                    )
                                  }
                                >
                                  Add enum value
                                </Button>
                              </div>
                            ) : effectiveType === "relation" ? (
                              <div className="grid gap-2 sm:grid-cols-2">
                                <select
                                  aria-label={`Relation resource for ${resource.name} ${field.name}`}
                                  className="h-10 rounded-md border bg-background px-2"
                                  value={
                                    fieldConfiguration.relation?.resource ??
                                    field.effectiveRelation?.resource ??
                                    ""
                                  }
                                  onChange={(event) => {
                                    const target = source.data.resources.find(
                                      (candidate) =>
                                        candidate.name === event.target.value,
                                    );
                                    updateField(
                                      resource.name,
                                      field.name,
                                      (current) => ({
                                        ...current,
                                        semanticType: "relation",
                                        enumValues: undefined,
                                        relation: target
                                          ? {
                                              resource: target.name,
                                              column:
                                                target.primaryKey ??
                                                target.fields[0]?.name ??
                                                "",
                                            }
                                          : undefined,
                                      }),
                                    );
                                  }}
                                >
                                  <option value="">Select resource</option>
                                  {source.data.resources.map((target) => (
                                    <option
                                      key={target.name}
                                      value={target.name}
                                    >
                                      {target.name}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  aria-label={`Relation field for ${resource.name} ${field.name}`}
                                  className="h-10 rounded-md border bg-background px-2"
                                  value={
                                    fieldConfiguration.relation?.column ??
                                    field.effectiveRelation?.column ??
                                    ""
                                  }
                                  onChange={(event) => {
                                    const targetResource =
                                      fieldConfiguration.relation?.resource ??
                                      field.effectiveRelation?.resource;
                                    updateField(
                                      resource.name,
                                      field.name,
                                      (current) => ({
                                        ...current,
                                        semanticType: "relation",
                                        relation: targetResource
                                          ? {
                                              resource: targetResource,
                                              column: event.target.value,
                                            }
                                          : undefined,
                                      }),
                                    );
                                  }}
                                >
                                  <option value="">Select field</option>
                                  {source.data.resources
                                    .find(
                                      (target) =>
                                        target.name ===
                                        (fieldConfiguration.relation
                                          ?.resource ??
                                          field.effectiveRelation?.resource),
                                    )
                                    ?.fields.map((targetField) => (
                                      <option
                                        key={targetField.name}
                                        value={targetField.name}
                                      >
                                        {targetField.name}
                                      </option>
                                    ))}
                                </select>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            <input
                              type="checkbox"
                              aria-label={`${resource.name} ${field.name} writable`}
                              className="h-4 w-4"
                              checked={fieldConfiguration.writable}
                              disabled={writableDisabled}
                              onChange={(event) =>
                                updateField(
                                  resource.name,
                                  field.name,
                                  (current) => ({
                                    ...current,
                                    writable: event.target.checked,
                                  }),
                                )
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {source.data.resources.length ? (
        <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/95 p-4 shadow-lg backdrop-blur">
          <p role="status" aria-live="polite" className="text-sm">
            {message}
          </p>
          <Button
            type="button"
            disabled={save.isPending}
            onClick={() => {
              setMessage("");
              save.mutate();
            }}
          >
            {save.isPending ? "Saving…" : "Save configuration"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
