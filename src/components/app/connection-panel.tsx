"use client";

import { useState } from "react";
import { CheckCircle2, KeyRound, Link2, LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ConnectionPanelProps {
  connectedUsername?: string;
  busy: boolean;
  onConnect: (token: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
}

export function ConnectionPanel({
  connectedUsername,
  busy,
  onConnect,
  onDisconnect,
}: ConnectionPanelProps) {
  const [token, setToken] = useState("");

  return (
    <Card className="border-border/80 shadow-none">
      <CardHeader>
        <div className="mb-2 flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          {connectedUsername ? (
            <CheckCircle2 className="size-5" />
          ) : (
            <Link2 className="size-5" />
          )}
        </div>
        <CardTitle>
          {connectedUsername ? "Fastmail is connected" : "Connect your Fastmail account"}
        </CardTitle>
        <CardDescription>
          {connectedUsername
            ? `Signed in as ${connectedUsername}. You can scan for mailing lists whenever you’re ready.`
            : "Paste an API token from Fastmail. This app never asks for or stores your Fastmail password."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {connectedUsername ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 border-s-2 border-primary bg-primary/5 p-3 text-sm">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-muted-foreground">
                Your token is stored securely. Disconnecting removes it along with this
                app’s scan results and activity history.
              </p>
            </div>
            <Button variant="destructive" disabled={busy} onClick={onDisconnect}>
              Disconnect and delete data
            </Button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void onConnect(token).then(() => setToken(""));
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="fastmail-token">API token</Label>
              <div className="relative">
                <KeyRound className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="fastmail-token"
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="fmu1-…"
                  className="ps-9"
                  required
                />
              </div>
            </div>
            <Button type="submit" className="w-full sm:w-auto" disabled={busy || token.trim().length < 20}>
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Link2 className="size-4" />
              )}
              Connect Fastmail
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
