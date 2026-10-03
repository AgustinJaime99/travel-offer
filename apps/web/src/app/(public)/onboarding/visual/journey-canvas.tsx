'use client';

import { useEffect, useRef } from 'react';
import { PerspectiveCamera, WebGLRenderer } from 'three';
import { type SceneId, scenePoses } from './scenes';
import { type AnimatedPose, createWorld } from './world';

const FRAME_SECONDS = 1 / 30;
const CYCLE_SECONDS = 3;

/** Target layer heights: cycling alternates beach and mountain; arrival shows both. */
function targetPose(scene: SceneId, time: number): AnimatedPose {
  const { busProgress, cruiseSpeed, luggageLoaded, destinationReveal, destinationCycles } =
    scenePoses[scene];
  const pose = { busProgress, cruiseSpeed, luggageLoaded, destinationReveal };
  if (pose.destinationReveal === 0) return { ...pose, beach: 0, mountain: 0 };
  if (!destinationCycles) return { ...pose, beach: 1, mountain: 1 };
  const showBeach = Math.floor(time / CYCLE_SECONDS) % 2 === 0;
  return { ...pose, beach: showBeach ? 1 : 0, mountain: showBeach ? 0 : 1 };
}

/**
 * Three.js renderer for the onboarding backdrop. Loaded with `ssr: false` only when the flag is on and
 * WebGL is available. Renders at most 30 fps, pauses while the tab is hidden or the canvas is off
 * screen, and renders a single still frame per scene when `animate` is false (reduced motion).
 */
export default function JourneyCanvas({
  scene,
  animate,
  onUnsupported,
}: {
  scene: SceneId;
  animate: boolean;
  onUnsupported: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef(scene);
  const redraw = useRef<(() => void) | null>(null);

  useEffect(() => {
    sceneRef.current = scene;
    redraw.current?.();
  }, [scene]);

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({
        antialias: window.devicePixelRatio < 2,
        alpha: true,
        powerPreference: 'low-power',
      });
    } catch {
      onUnsupported();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.className = 'block size-full';
    container.appendChild(renderer.domElement);

    const world = createWorld();
    const camera = new PerspectiveCamera(32, 1, 0.1, 60);
    camera.position.set(0, 3.4, 11.5);
    camera.lookAt(0, 0.9, 0);

    let time = 0;
    let travelled = 0;
    let pose = targetPose(sceneRef.current, 0);
    let frame = 0;
    let last = 0;
    let visible = !document.hidden;
    let onScreen = true;

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      if (!clientWidth || !clientHeight) return;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      // Narrow phones: pull back so the bus and destination stay in frame.
      camera.position.z = camera.aspect < 2 ? 11.5 + (2 - camera.aspect) * 5 : 11.5;
      camera.updateProjectionMatrix();
    };
    const draw = () => {
      world.apply(pose, time, travelled);
      renderer.render(world.scene, camera);
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const delta = last ? Math.min((now - last) / 1000, 0.1) : 0;
      if (delta < FRAME_SECONDS && last) return;
      last = now;
      time += delta;
      const target = targetPose(sceneRef.current, time);
      const ease = 1 - Math.exp(-delta * 2.2);
      const next = { ...pose };
      for (const key of Object.keys(target) as (keyof AnimatedPose)[]) {
        next[key] = pose[key] + (target[key] - pose[key]) * ease;
      }
      pose = next;
      travelled += pose.cruiseSpeed * delta;
      draw();
    };
    const start = () => {
      if (!animate || frame || !visible || !onScreen) return;
      last = 0;
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    redraw.current = () => {
      if (animate) return;
      // Reduced motion: jump straight to the new scene's still frame.
      pose = targetPose(sceneRef.current, 0);
      draw();
    };

    const onVisibility = () => {
      visible = !document.hidden;
      if (visible) start();
      else stop();
    };
    const intersection = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      if (onScreen) start();
      else stop();
    });
    const resizing = new ResizeObserver(() => {
      resize();
      if (!frame) draw();
    });
    const onContextLost = (event: Event) => {
      event.preventDefault();
      stop();
      onUnsupported();
    };

    resize();
    draw();
    start();
    document.addEventListener('visibilitychange', onVisibility);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    intersection.observe(container);
    resizing.observe(container);

    return () => {
      stop();
      redraw.current = null;
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      intersection.disconnect();
      resizing.disconnect();
      world.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [animate, onUnsupported]);

  return <div ref={host} className="absolute inset-0" />;
}
