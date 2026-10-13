import { useRef, useState } from "react";
import { useActor } from "@xstate/react";
import { assign, createMachine, fromCallback, fromPromise } from "xstate";

const frames = Array.from({ length: 509 })
  .fill(0)
  .map((_, i) => `frame_${String(i + 1).padStart(6, "0")}.png`);

const machine = createMachine({
  initial: "load",
  types: {
    context: {} as { frames?: HTMLImageElement[]; frame?: number },
  },
  on: {
    FRAME_CHANGE: {
      target: ".waiting",
      actions: assign({ frame: ({ event }) => event.value }),
    },
  },
  states: {
    load: {
      invoke: {
        src: "load_frames",
        onDone: {
          target: "paused",
          actions: assign({ frames: ({ event }) => event.output }),
        },
      },
    },
    playing: {
      on: {
        END: "end",
        PAUSE: "paused",
        FRAME: {
          actions: assign({
            frame: ({ event }) => event.frame,
          }),
        },
      },
      invoke: {
        id: "player",
        src: "player",
        input: ({ context }) => context,
      },
    },
    paused: {
      on: {
        PLAY: "playing",
      },
    },
    waiting: {
      on: {
        FRAME_CHANGE_END: "playing",
        FRAME_CHANGE: {
          actions: assign({ frame: ({ event }) => event.value }),
        },
      },
    },
    end: {
      on: {
        PLAY: {
          target: "playing",
          actions: assign({ frame: 0 }),
        },
      },
    },
  },
});

function App() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  const range = useRef<HTMLInputElement | null>(null);
  const [ref, setRef] = useState<HTMLCanvasElement | null>(null);

  const [actor, send] = useActor(
    machine.provide({
      actors: {
        load_frames: fromPromise(() => {
          return Promise.all(
            frames.map((frame) => {
              return new Promise<HTMLImageElement>((resolve, reject) => {
                const image = new Image(width, height);
                image.onload = () => resolve(image);
                image.onerror = (err) => reject(err);
                image.src = `/frames/${frame}`;
              });
            }),
          );
        }),
        player: fromCallback(({ sendBack, input }) => {
          const canvas = ref;
          let raf: number | null = null;

          if (canvas) {
            const ctx = canvas.getContext("2d");

            const { frames, frame = 0 } = input as {
              frames: HTMLImageElement[];
              frame?: number;
            };

            let tick = frame;

            const draw = (frame: HTMLImageElement) => {
              const scale = Math.min(
                canvas.width / frame.width,
                canvas.height / frame.height,
              );

              const newWidth = frame.width * scale;
              const newHeight = frame.height * scale;

              // Center the image inside the canvas
              const x = (canvas.width - newWidth) / 2;
              const y = (canvas.height - newHeight) / 2;

              ctx?.clearRect(0, 0, canvas.width, canvas.height);
              ctx?.drawImage(frame, x, y, newWidth, newHeight);
            };

            const loop = () => {
              const frame = frames[tick];

              if (!frame) {
                sendBack({ type: "END" });
                return;
              }

              draw(frame);

              sendBack({ type: "FRAME", frame: tick });

              tick++;
              raf = requestAnimationFrame(loop);
            };

            loop();
          }

          return () => {
            if (raf) cancelAnimationFrame(raf);
          };
        }),
      },
    }),
  );

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <canvas
        ref={setRef}
        width={width}
        height={height}
        style={{ backgroundColor: "black" }}
      />

      <div style={{ left: 0, right: 0, bottom: 0, position: "absolute" }}>
        <input
          min={1}
          ref={range}
          type="range"
          value={actor.context?.frame ?? 0}
          max={(actor.context?.frames?.length ?? 1) - 1}
          onChange={(e) => {
            send({ type: "FRAME_CHANGE", value: parseInt(e.target.value) });
          }}
          onPointerUp={() => {
            send({ type: "FRAME_CHANGE_END" });
          }}
        />
        <div
          style={{
            gap: "1rem",
            display: "flex",
            marginTop: "1rem",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {actor.matches("load") ? (
            <p>loading...</p>
          ) : actor.matches("playing") ? (
            <button onClick={() => send({ type: "PAUSE" })}>pause</button>
          ) : (
            <button onClick={() => send({ type: "PLAY" })}>play</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
