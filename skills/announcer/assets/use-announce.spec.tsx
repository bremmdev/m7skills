// Tests for the React binding. Written for Vitest with @testing-library/react; for Jest, drop the vitest import and
// replace `vi` with `jest`. The jsdom stand-in for modals and the cleanup are the same as in announcer.spec.ts.
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANNOUNCER_ATTRIBUTE, PRIMING_DELAY, QUEUE_DELAY, clearAnnouncer } from "./announcer";
import { type UseAnnounceOptions, useAnnounce } from "./use-announce";

const getWrappers = (container: Element = document.body) =>
  Array.from(container.children).filter((child) => child.hasAttribute(ANNOUNCER_ATTRIBUTE));

const messages = (politeness: "polite" | "assertive", container: Element = document.body) =>
  Array.from(getWrappers(container)[0]?.querySelector(`:scope > [aria-live="${politeness}"]`)?.children ?? []).map(
    (node) => node.textContent
  );

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

const Announcing = ({
  options,
  onRender
}: {
  options?: UseAnnounceOptions;
  onRender?: (announce: ReturnType<typeof useAnnounce>) => void;
}) => {
  const ref = React.useRef<HTMLButtonElement>(null);
  const announceFromButton = useAnnounce(ref, options);
  onRender?.(announceFromButton);
  return (
    <button ref={ref} type="button" onClick={() => announceFromButton("Clicked")}>
      Announce
    </button>
  );
};

describe("useAnnounce", () => {
  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    // Vitest without globals doesn't unmount between tests on its own
    cleanup();
    clearAnnouncer();
    for (const wrapper of document.querySelectorAll(`[${ANNOUNCER_ATTRIBUTE}]`)) {
      wrapper.remove();
    }
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("creates the pair on mount, in the component's dialog", () => {
    render(
      <dialog data-testid="dialog">
        <Announcing />
      </dialog>
    );
    expect(getWrappers(screen.getByTestId("dialog"))).toHaveLength(1);
  });

  it("creates nothing on mount when not enabled", () => {
    render(<Announcing options={{ enabled: false }} />);
    expect(document.querySelectorAll(`[${ANNOUNCER_ATTRIBUTE}]`)).toHaveLength(0);
  });

  it("creates the pair once it is enabled", () => {
    const { rerender } = render(<Announcing options={{ enabled: false }} />);
    rerender(<Announcing options={{ enabled: true }} />);
    expect(getWrappers()).toHaveLength(1);
  });

  it("returns the same function on every render", () => {
    const functions: Array<ReturnType<typeof useAnnounce>> = [];
    const { rerender } = render(<Announcing onRender={(fn) => functions.push(fn)} />);
    rerender(<Announcing onRender={(fn) => functions.push(fn)} />);

    expect(functions).toHaveLength(2);
    expect(functions[0]).toBe(functions[1]);
  });

  it("announces from the component's element", () => {
    render(
      <dialog open data-testid="dialog">
        <Announcing />
      </dialog>
    );
    advance(PRIMING_DELAY);

    act(() => screen.getByRole("button").click());
    advance(QUEUE_DELAY);

    expect(messages("polite", screen.getByTestId("dialog"))).toEqual(["Clicked"]);
  });

  it("passes the options on", () => {
    let announceFromButton: ReturnType<typeof useAnnounce> | undefined;
    render(<Announcing onRender={(fn) => (announceFromButton = fn)} />);
    advance(PRIMING_DELAY);

    act(() => announceFromButton?.("Connection lost", { politeness: "assertive" }));
    advance(QUEUE_DELAY);

    expect(messages("assertive")).toEqual(["Connection lost"]);
  });
});
