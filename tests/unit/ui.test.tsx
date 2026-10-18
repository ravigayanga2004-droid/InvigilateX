// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ThemeToggle, useResource } from "@/components/ui";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.classList.remove("dark");
  localStorage.clear();
});
it("persists theme preference and responds to external theme changes", async () => {
  render(<ThemeToggle />);
  fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
  await waitFor(() =>
    expect(document.documentElement.classList.contains("dark")).toBe(true),
  );
  expect(localStorage.getItem("examguard-theme")).toBe("dark");
  await act(async () => {
    document.documentElement.classList.remove("dark");
  });
  expect(
    screen.getByRole("button", { name: "Switch to dark mode" }),
  ).toBeTruthy();
});
it("ignores a stale response after the resource changes", async () => {
  let resolveOld!: (response: Response) => void;
  vi.spyOn(globalThis, "fetch").mockImplementation((url) =>
    String(url).endsWith("old")
      ? new Promise((resolve) => {
          resolveOld = resolve;
        })
      : Promise.resolve(new Response(JSON.stringify({ name: "current" }))),
  );
  function Resource({ path }: { path: string }) {
    const { data, loading } = useResource<{ name: string }>(path);
    return <p>{loading ? "Loading" : data?.name}</p>;
  }
  const view = render(<Resource path="old" />);
  view.rerender(<Resource path="new" />);
  await waitFor(() => expect(screen.getByText("current")).toBeTruthy());
  await act(async () =>
    resolveOld(new Response(JSON.stringify({ name: "stale" }))),
  );
  expect(screen.queryByText("stale")).toBeNull();
  expect(screen.getByText("current")).toBeTruthy();
});
