"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";

/** Smoke example proving a Radix/shadcn Dialog renders end-to-end (#42). */
export function DashboardDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Quick actions</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quick actions</DialogTitle>
          <DialogDescription>
            Compose a post, review your inbox, or jump into analytics. More actions land in upcoming
            epics.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
