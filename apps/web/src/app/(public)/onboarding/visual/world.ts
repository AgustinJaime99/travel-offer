import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DodecahedronGeometry,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshLambertMaterial,
  type Object3D,
  PlaneGeometry,
  Scene,
} from 'three';
import type { ScenePose } from './scenes';

/** Low-poly world: flat-shaded Lambert materials, two lights, no shadows, no textures. */
export interface World {
  scene: Scene;
  /** Applies an (eased) pose plus the accumulated time and scroll distance. */
  apply: (pose: AnimatedPose, time: number, travelled: number) => void;
  dispose: () => void;
}

export type AnimatedPose = Omit<ScenePose, 'sky' | 'destinationCycles'> & {
  /** Height of each destination layer, 0 (flat, hidden) to 1. */
  beach: number;
  mountain: number;
};

const ROAD_LENGTH = 40;
const WRAP = ROAD_LENGTH / 2;

export function createWorld(): World {
  const scene = new Scene();
  const geometries = new Set<BufferGeometry>();
  const materials = new Map<string, Material>();

  const material = (color: string) => {
    let found = materials.get(color);
    if (!found) {
      found = new MeshLambertMaterial({ color, flatShading: true });
      materials.set(color, found);
    }
    return found;
  };
  const mesh = (
    geometry: BufferGeometry,
    color: string,
    at: [number, number, number] = [0, 0, 0],
  ) => {
    geometries.add(geometry);
    const created = new Mesh(geometry, material(color));
    created.position.set(...at);
    return created;
  };
  const group = (...children: Object3D[]) => {
    const created = new Group();
    created.add(...children);
    return created;
  };

  scene.add(new HemisphereLight('#fff7ed', '#4d7c0f', 2.2));
  const sun = new DirectionalLight('#ffffff', 1.6);
  sun.position.set(4, 8, 6);
  scene.add(sun);

  // Ground and road along the X axis.
  const ground = mesh(new PlaneGeometry(80, 30), '#86efac', [0, -0.01, -5]);
  ground.rotation.x = -Math.PI / 2;
  const road = mesh(new PlaneGeometry(80, 2.2), '#475569', [0, 0, 0.6]);
  road.rotation.x = -Math.PI / 2;
  scene.add(ground, road);

  const dashes = Array.from({ length: 14 }, (_, index) => {
    const dash = mesh(new PlaneGeometry(0.9, 0.12), '#f8fafc', [0, 0.01, 0.6]);
    dash.rotation.x = -Math.PI / 2;
    dash.userData['base'] = index * (ROAD_LENGTH / 14) - WRAP;
    scene.add(dash);
    return dash;
  });

  // Roadside trees and clouds, scrolled with the travelled distance.
  const tree = (scale: number) =>
    group(
      mesh(new CylinderGeometry(0.08, 0.1, 0.5, 5), '#92400e', [0, 0.25, 0]),
      mesh(new ConeGeometry(0.45 * scale, 1.2 * scale, 6), '#15803d', [0, 0.5 + 0.6 * scale, 0]),
    );
  const scenery = Array.from({ length: 12 }, (_, index) => {
    const created = tree(0.8 + ((index * 37) % 5) / 10);
    created.position.z = index % 3 === 0 ? 2.6 : -1.6 - (index % 4);
    created.userData['base'] = index * (ROAD_LENGTH / 12) - WRAP;
    created.userData['parallax'] = created.position.z > 0 ? 1.2 : 0.8;
    scene.add(created);
    return created;
  });
  const clouds = Array.from({ length: 4 }, (_, index) => {
    const created = group(
      mesh(new DodecahedronGeometry(0.6, 0), '#ffffff', [0, 0, 0]),
      mesh(new DodecahedronGeometry(0.45, 0), '#ffffff', [0.6, -0.1, 0]),
      mesh(new DodecahedronGeometry(0.4, 0), '#ffffff', [-0.55, -0.15, 0]),
    );
    created.position.set(0, 4 + (index % 2) * 0.8, -9);
    created.userData['base'] = index * (ROAD_LENGTH / 4) - WRAP;
    scene.add(created);
    return created;
  });

  // Home: where the trip starts; it slides out of view as the bus departs.
  const home = group(
    mesh(new BoxGeometry(1.6, 1.1, 1.2), '#fecaca', [0, 0.55, 0]),
    mesh(new ConeGeometry(1.25, 0.8, 4), '#b91c1c', [0, 1.5, 0]),
    mesh(new BoxGeometry(0.35, 0.6, 0.05), '#7c2d12', [0.3, 0.3, 0.62]),
  );
  home.children[1]!.rotation.y = Math.PI / 4;
  home.position.set(-5, 0, -1.4);
  scene.add(home);

  // Bus with wheels, windows and a roof rack.
  const wheels = [-0.85, 0.85].flatMap((x) =>
    [-0.5, 0.5].map((z) => {
      const wheel = mesh(new CylinderGeometry(0.22, 0.22, 0.14, 8), '#1e293b', [x, 0.22, z]);
      wheel.rotation.x = Math.PI / 2;
      return wheel;
    }),
  );
  const windows = [-0.7, -0.25, 0.2, 0.65].map((x) =>
    mesh(new BoxGeometry(0.34, 0.3, 0.02), '#bae6fd', [x, 0.95, 0.51]),
  );
  const busBody = group(
    mesh(new BoxGeometry(2.2, 0.9, 1), '#f59e0b', [0, 0.75, 0]),
    mesh(new BoxGeometry(0.06, 0.45, 0.8), '#bae6fd', [1.11, 0.95, 0]),
    mesh(new BoxGeometry(2.21, 0.1, 1.01), '#c2410c', [0, 0.45, 0]),
    mesh(new BoxGeometry(1.6, 0.05, 0.8), '#334155', [-0.1, 1.23, 0]),
    ...windows,
  );
  const bus = group(busBody, ...wheels);
  bus.position.z = 0.6;
  scene.add(bus);

  // Suitcases: on the sidewalk while packing, then lifted onto the roof rack (bus-local coordinates).
  const luggage = (['#2563eb', '#db2777', '#16a34a'] as const).map((color, index) => {
    const suitcase = group(
      mesh(new BoxGeometry(0.34, 0.42, 0.18), color, [0, 0.21, 0]),
      mesh(new BoxGeometry(0.14, 0.06, 0.04), '#0f172a', [0, 0.45, 0]),
    );
    suitcase.userData['ground'] = [-0.6 + index * 0.45, 0, 0.95];
    suitcase.userData['roof'] = [-0.55 + index * 0.45, 1.27, 0];
    busBody.add(suitcase);
    return suitcase;
  });

  // Destination: beach (sea, sand, palm, umbrella) and mountains (snowy peaks, pines).
  const palm = group(
    mesh(new CylinderGeometry(0.07, 0.1, 1.4, 5), '#a16207', [0, 0.7, 0]),
    ...[0, 1, 2, 3, 4].map((index) => {
      const leaf = mesh(new ConeGeometry(0.16, 0.9, 4), '#16a34a', [0, 1.4, 0]);
      leaf.rotation.set(Math.PI / 2.6, (index * Math.PI * 2) / 5, 0, 'YXZ');
      return leaf;
    }),
  );
  palm.position.set(-0.6, 0, -0.2);
  const beach = group(
    mesh(new BoxGeometry(6, 0.06, 3.4), '#fde68a', [0.6, 0.02, -1.4]),
    mesh(new BoxGeometry(5, 0.04, 3.4), '#0ea5e9', [3.4, 0.03, -2.4]),
    palm,
    mesh(new CylinderGeometry(0.02, 0.02, 0.9, 4), '#e2e8f0', [0.9, 0.45, -0.6]),
    mesh(new ConeGeometry(0.55, 0.3, 8), '#ef4444', [0.9, 0.95, -0.6]),
    mesh(new CircleGeometry(0.5, 10), '#facc15', [3.5, 3.4, -6]),
  );
  const peak = (x: number, z: number, height: number) =>
    group(
      mesh(new ConeGeometry(height * 0.7, height, 5), '#64748b', [x, height / 2, z]),
      mesh(new ConeGeometry(height * 0.26, height * 0.36, 5), '#f8fafc', [x, height * 0.82, z]),
    );
  const pine = (x: number, z: number) =>
    group(mesh(new ConeGeometry(0.3, 1, 5), '#166534', [x, 0.5, z]));
  const mountain = group(
    peak(1.6, -5, 4),
    peak(3.8, -6, 3.2),
    peak(-0.6, -6.5, 2.8),
    pine(0, -1.6),
    pine(0.6, -2.2),
    pine(2.2, -1.8),
  );
  const destination = group(mountain, beach);
  scene.add(destination);

  const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
  const wrap = (value: number) =>
    ((((value + WRAP) % ROAD_LENGTH) + ROAD_LENGTH) % ROAD_LENGTH) - WRAP;

  return {
    scene,
    apply(pose, time, travelled) {
      const moving = Math.min(pose.cruiseSpeed / 4, 1);
      bus.position.x = lerp(-2.6, 2.2, pose.busProgress);
      busBody.position.y = moving * Math.abs(Math.sin(time * 9)) * 0.03;
      for (const wheel of wheels) wheel.rotation.y = -travelled / 0.22;

      for (const dash of dashes) dash.position.x = wrap(dash.userData['base'] - travelled);
      for (const item of scenery) {
        item.position.x = wrap(item.userData['base'] - travelled * item.userData['parallax']);
        // Roadside trees thin out where the destination appears.
        item.visible = !(pose.destinationReveal > 0.3 && item.position.x > 2.5);
      }
      for (const cloud of clouds)
        cloud.position.x = wrap(cloud.userData['base'] - time * 0.25 - travelled * 0.1);

      home.position.x = -5 - pose.busProgress * 22;
      home.visible = home.position.x > -14;

      luggage.forEach((suitcase, index) => {
        const t = Math.min(Math.max(pose.luggageLoaded * 1.6 - index * 0.3, 0), 1);
        const [gx, gy, gz] = suitcase.userData['ground'] as number[];
        const [rx, ry, rz] = suitcase.userData['roof'] as number[];
        suitcase.position.set(
          lerp(gx!, rx!, t),
          lerp(gy!, ry!, t) + Math.sin(Math.PI * t) * 0.9,
          lerp(gz!, rz!, t),
        );
        suitcase.rotation.z =
          t < 1 && t > 0 ? Math.sin(Math.PI * t) * 0.6 : t === 1 ? Math.PI / 2 : 0;
      });

      destination.visible = pose.destinationReveal > 0.01;
      destination.position.set(lerp(14, 4.2, pose.destinationReveal), 0, -0.4);
      // Destination layers grow out of the ground instead of popping in.
      const beachScale = Math.max(pose.beach, 0.001);
      const mountainScale = Math.max(pose.mountain, 0.001);
      beach.scale.set(1, beachScale, 1);
      beach.visible = beachScale > 0.15;
      mountain.scale.set(1, mountainScale, 1);
      mountain.visible = mountainScale > 0.15;
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const created of materials.values()) created.dispose();
    },
  };
}
