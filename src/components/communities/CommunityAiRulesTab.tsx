import { useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAgentCommunityRules } from "@/hooks/useAgentCommunityRules";
import {
  AI_RULE_CATEGORIES,
  agentRuleCategoryLabel,
  isEditableAgentRule,
  isGlobalAgentRule,
  isOperatorAgentRule,
  type AgentCommunityRule,
  type AiRuleCategory,
} from "@/lib/agentCommunityRules";

type Props = {
  communityId: string;
  readOnly?: boolean;
};

const EMPTY_FORM = {
  category: "general" as AiRuleCategory,
  ruleContent: "",
};

export function CommunityAiRulesTab({ communityId, readOnly = false }: Props) {
  const {
    canManage,
    accessLoading,
    accessError,
    rules,
    rulesLoading,
    rulesError,
    createRule,
    updateRule,
    deleteRule,
    isSaving,
  } = useAgentCommunityRules(communityId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const canEdit = canManage && !readOnly;
  const sharedRules = rules.filter((rule) => !isOperatorAgentRule(rule));

  function beginEdit(rule: AgentCommunityRule) {
    const category = AI_RULE_CATEGORIES.some((item) => item.value === rule.category)
      ? (rule.category as AiRuleCategory)
      : "general";
    setEditingId(rule.id);
    setPendingDeleteId(null);
    setForm({ category, ruleContent: rule.rule_content });
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function onSubmit() {
    const ruleContent = form.ruleContent.trim();
    if (!ruleContent) return;
    if (editingId) {
      updateRule({ id: editingId, category: form.category, ruleContent }, { onSuccess: resetForm });
      return;
    }
    createRule({ category: form.category, ruleContent }, { onSuccess: resetForm });
  }

  if (accessLoading) return <Skeleton className="h-40 w-full" />;

  if (accessError) {
    return (
      <p className="text-sm text-destructive">
        {accessError instanceof Error ? accessError.message : "Nie udało się sprawdzić uprawnień."}
      </p>
    );
  }

  if (!canManage) {
    return (
      <p className="text-sm text-muted-foreground">
        Wytyczne AI może przeglądać i zmieniać tylko zarządca lub administrator przypisany do tej wspólnoty.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Procedury i wytyczne AI</CardTitle>
          <CardDescription>
            Lista pochodzi z bazy procedur agenta. Reguła globalna obowiązuje każdą wspólnotę i jest tylko do odczytu. Wytyczne użytkownika są w oknie Wytyczne na czacie agenta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rulesLoading ? <Skeleton className="h-24 w-full" /> : null}
          {rulesError ? (
            <p className="text-sm text-destructive">
              {rulesError instanceof Error ? rulesError.message : "Nie udało się wczytać wytycznych."}
            </p>
          ) : null}
          {!rulesLoading && !rulesError && sharedRules.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak wytycznych dla tej wspólnoty.</p>
          ) : null}
          {sharedRules.map((rule) => {
            const global = isGlobalAgentRule(rule);
            const editable = canEdit && isEditableAgentRule(rule, communityId);
            return (
              <article key={rule.id} className="rounded-lg border border-border/60 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{agentRuleCategoryLabel(rule.category)}</Badge>
                  {global ? <Badge variant="secondary">Reguła globalna</Badge> : null}
                  {!global && rule.category !== "admin_notes" ? <Badge variant="secondary">Wspólnota</Badge> : null}
                  {rule.category === "admin_notes" ? <Badge variant="secondary">Z uwag administracji</Badge> : null}
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{rule.rule_content}</p>
                {editable ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => beginEdit(rule)}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      Edytuj
                    </Button>
                    {pendingDeleteId === rule.id ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={isSaving}
                        onClick={() => deleteRule(rule.id, { onSuccess: () => setPendingDeleteId(null) })}
                      >
                        Potwierdź usunięcie
                      </Button>
                    ) : (
                      <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setPendingDeleteId(rule.id)}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        Usuń
                      </Button>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </CardContent>
      </Card>

      {canEdit ? (
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">{editingId ? "Edycja wytycznej" : "Nowa wytyczna"}</CardTitle>
            <CardDescription>Na przykład: każdy wydatek powyżej 500 zł wymaga akceptacji zarządu.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ai-rule-category">Kategoria</Label>
              <Select
                value={form.category}
                onValueChange={(value) => setForm((current) => ({ ...current, category: value as AiRuleCategory }))}
              >
                <SelectTrigger id="ai-rule-category" className="max-w-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_RULE_CATEGORIES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-rule-content">Treść procedury</Label>
              <Textarea
                id="ai-rule-content"
                rows={4}
                maxLength={2000}
                value={form.ruleContent}
                onChange={(event) => setForm((current) => ({ ...current, ruleContent: event.target.value }))}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={isSaving || form.ruleContent.trim().length === 0} onClick={onSubmit} className="gap-2">
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {editingId ? "Zapisz zmiany" : "Dodaj wytyczną"}
              </Button>
              {editingId ? (
                <Button type="button" variant="outline" onClick={resetForm}>
                  Anuluj
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : readOnly ? (
        <p className="text-sm text-muted-foreground">Wspólnota nieaktywna — wytyczne AI są tylko do odczytu.</p>
      ) : null}
    </div>
  );
}
