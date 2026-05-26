import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GameRoom, PlayerState, BananaObstacle } from '../types';
import { AudioEngine } from './AudioEngine';

interface ThreeGameProps {
  selfPlayerId: string;
  room: GameRoom | null;
  onSyncPhysics: (physics: any) => void;
  onCollectBox: (boxId: number) => void;
  onDropBanana: (pos: { posX: number; posY: number; posZ: number }) => void;
  onCrossLap: (lap: number) => void;
  boosterActive: boolean;
  setBoosterActive: (active: boolean) => void;
  shieldActive: boolean;
  setShieldActive: (active: boolean) => void;
  isMobileSteer: { left: boolean; right: boolean; gas: boolean; brake: boolean; drift: boolean };
  cameraType: 'isometric' | 'chase' | 'first';
  setHUDState: (state: { speed: number; gauge: number; stock: number; lap: number }) => void;
  showComicPop: (text: string, color?: string) => void;
  peerPhysicsUpdates: React.MutableRefObject<Map<string, any>>;
}

export const ThreeGame: React.FC<ThreeGameProps> = ({
  selfPlayerId,
  room,
  onSyncPhysics,
  onCollectBox,
  onDropBanana,
  onCrossLap,
  boosterActive,
  setBoosterActive,
  shieldActive,
  setShieldActive,
  isMobileSteer,
  cameraType,
  setHUDState,
  showComicPop,
  peerPhysicsUpdates,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  
  // Keep up-to-date refs for variables used inside the high-frequency animation loop
  const roomRef = useRef<GameRoom | null>(room);
  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  const boosterActiveRef = useRef(boosterActive);
  useEffect(() => {
    boosterActiveRef.current = boosterActive;
  }, [boosterActive]);

  const shieldActiveRef = useRef(shieldActive);
  useEffect(() => {
    shieldActiveRef.current = shieldActive;
  }, [shieldActive]);

  const cameraTypeRef = useRef(cameraType);
  useEffect(() => {
    cameraTypeRef.current = cameraType;
  }, [cameraType]);

  // Keyboard driving states
  const keysRef = useRef<{ [key: string]: boolean }>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const code = e.code;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 's', 'a', 'd', 'shift', ' '].includes(k) || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift', ' '].includes(e.key)) {
        keysRef.current[e.key] = true;
        keysRef.current[k] = true;
      }
      // Prevent browser spatial scrolling
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keysRef.current[e.key] = false;
      keysRef.current[k] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;

    // --- 1. THREE.JS INITIALIZATION ---
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060b24); // Retro-anime twilight tone
    scene.fog = new THREE.FogExp2(0x060b24, 0.0038);

    const camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);

    // --- 2. MULTIPLAYER LUMINARY LIGHTING ---
    const ambLight = new THREE.AmbientLight(0xffffff, 0.72);
    scene.add(ambLight);

    const dirLight = new THREE.DirectionalLight(0xc084fc, 1.4);
    dirLight.position.set(50, 200, 50);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const cyanNeon = new THREE.PointLight(0x22d3ee, 2.5, 400);
    cyanNeon.position.set(20, 30, -50);
    scene.add(cyanNeon);

    const pinkNeon = new THREE.PointLight(0xf43f5e, 2.5, 400);
    pinkNeon.position.set(120, 25, -110);
    scene.add(pinkNeon);

    // Dynamic groupings
    const roadGroup = new THREE.Group();
    const decorationGroup = new THREE.Group();
    const boxesGroup = new THREE.Group();
    const bananaGroup = new THREE.Group();
    const particleGroup: THREE.Mesh[] = [];
    scene.add(roadGroup);
    scene.add(decorationGroup);
    scene.add(boxesGroup);
    scene.add(bananaGroup);

    // --- 3. PATH DATA GENERATION ---
    const points = [
      new THREE.Vector3(0, 0, 0), // START
      new THREE.Vector3(60, 0, 30),
      new THREE.Vector3(120, 0, 15),
      new THREE.Vector3(180, 0, -40),
      new THREE.Vector3(160, 0, -110),
      new THREE.Vector3(90, 0, -150),
      new THREE.Vector3(20, 0, -110),
      new THREE.Vector3(-40, 0, -160),
      new THREE.Vector3(-100, 0, -120),
      new THREE.Vector3(-140, 0, -60),
      new THREE.Vector3(-90, 0, -15),
      new THREE.Vector3(-40, 0, 15),
      new THREE.Vector3(-10, 0, 0),
    ];
    const trackSpline = new THREE.CatmullRomCurve3(points, true);

    // Ribbon track modeling
    const trackGeometry = new THREE.TubeGeometry(trackSpline, 220, 14, 8, true);
    const trackMaterial = new THREE.MeshBasicMaterial({
      color: 0x111827, // Slate-black ribbon background
      side: THREE.DoubleSide,
    });
    const roadMesh = new THREE.Mesh(trackGeometry, trackMaterial);
    roadMesh.scale.set(1, 0.015, 1); // Clamp visual depth to keep it flat
    roadGroup.add(roadMesh);

    // Procedural trackside details
    const splinePoints = trackSpline.getSpacedPoints(150);
    for (let i = 0; i < 150; i++) {
      const pt = splinePoints[i];
      const tangent = trackSpline.getTangentAt(i / 150).normalize();
      const normal = new THREE.Vector3(0, 1, 0);
      const binormal = tangent.clone().cross(normal).normalize();

      // Dashed lane lines (Yellow)
      if (i % 2 === 0) {
        const laneGeo = new THREE.BoxGeometry(0.3, 0.05, 2.5);
        const laneMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
        const laneDash = new THREE.Mesh(laneGeo, laneMat);
        laneDash.position.copy(pt).add(new THREE.Vector3(0, 0.05, 0));
        laneDash.lookAt(pt.clone().add(tangent));
        roadGroup.add(laneDash);
      }

      // Border spheres (Cyan left / Pink right)
      const leftBoundaryPos = pt.clone().add(binormal.clone().multiplyScalar(-13.8));
      const leftSphere = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 6), new THREE.MeshBasicMaterial({ color: 0x22d3ee }));
      leftSphere.position.copy(leftBoundaryPos).add(new THREE.Vector3(0, 0.08, 0));
      roadGroup.add(leftSphere);

      const rightBoundaryPos = pt.clone().add(binormal.clone().multiplyScalar(13.8));
      const rightSphere = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 6), new THREE.MeshBasicMaterial({ color: 0xf43f5e }));
      rightSphere.position.copy(rightBoundaryPos).add(new THREE.Vector3(0, 0.08, 0));
      roadGroup.add(rightSphere);

      // Cyber trees
      if (i % 6 === 0) {
        const sign = (i % 12 === 0) ? -1 : 1;
        const treePos = pt.clone().add(binormal.clone().multiplyScalar(19 * sign));
        const treeHeight = 6 + Math.random() * 8;
        const treeGeo = new THREE.ConeGeometry(3.0, treeHeight, 4);
        const treeMat = new THREE.MeshStandardMaterial({
          color: i % 12 === 0 ? 0x22d3ee : 0xec4899,
          roughness: 0.15,
          emissive: i % 12 === 0 ? 0x0891b2 : 0xbe185d,
          emissiveIntensity: 0.4,
        });
        const treeMesh = new THREE.Mesh(treeGeo, treeMat);
        treeMesh.position.copy(treePos);
        treeMesh.position.y += treeHeight / 2;
        decorationGroup.add(treeMesh);
      }
    }

    // Finish Gate
    const gateGroup = new THREE.Group();
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 16, 6), new THREE.MeshBasicMaterial({ color: 0x334155 }));
    p1.position.set(-15, 8, 0);
    const p2 = p1.clone();
    p2.position.set(15, 8, 0);

    const crossPole = new THREE.Mesh(new THREE.BoxGeometry(32, 1.8, 2.5), new THREE.MeshBasicMaterial({ color: 0x0f172a }));
    crossPole.position.set(0, 16, 0);
    const gateBanner = new THREE.Mesh(new THREE.BoxGeometry(14, 2.0, 2.7), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
    gateBanner.position.set(0, 16, 0);

    gateGroup.add(p1, p2, crossPole, gateBanner);
    const startTangent = trackSpline.getTangentAt(0).normalize();
    gateGroup.lookAt(startTangent);
    gateGroup.position.copy(trackSpline.getPointAt(0));
    roadGroup.add(gateGroup);

    // --- 4. ITEM BOX RENDERING MODEL ---
    const boxesMap = new Map<number, THREE.Mesh>();
    
    const syncItemBoxes = (boxesList: any[]) => {
      boxesList.forEach((boxData) => {
        let boxMesh = boxesMap.get(boxData.id);
        if (!boxMesh) {
          const boxGeo = new THREE.BoxGeometry(2.0, 2.0, 2.0);
          const boxMat = new THREE.MeshStandardMaterial({
            color: 0xfacc15,
            transparent: true,
            opacity: 0.88,
            metalness: 0.8,
            roughness: 0.15,
            emissive: 0xfacc15,
            emissiveIntensity: 0.5,
          });
          boxMesh = new THREE.Mesh(boxGeo, boxMat);
          // Distribute box positions along track segments
          const t = (boxData.id + 0.5) / 12;
          const point = trackSpline.getPointAt(t);
          boxMesh.position.copy(point).add(new THREE.Vector3(0, 1.8, 0));
          boxesGroup.add(boxMesh);
          boxesMap.set(boxData.id, boxMesh);
        }
        boxMesh.visible = boxData.active;
      });
    };

    if (roomRef.current) {
      syncItemBoxes(roomRef.current.itemBoxes);
    }

    // --- 5. BANANAS (OBSTACLES) SYNC MODEL ---
    const bananasMap = new Map<string, THREE.Mesh>();
    const syncBananas = (bananaList: BananaObstacle[]) => {
      // Remove old deleted bananas
      bananasMap.forEach((mesh, id) => {
        if (!bananaList.some((b) => b.id === id)) {
          bananaGroup.remove(mesh);
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
          } else {
            mesh.material.dispose();
          }
          bananasMap.delete(id);
        }
      });

      // Add or update bananas
      bananaList.forEach((b) => {
        if (!bananasMap.has(b.id)) {
          const bGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.4, 8);
          const bMat = new THREE.MeshStandardMaterial({
            color: 0xfacc15,
            emissive: 0xeab308,
            emissiveIntensity: 0.4,
          });
          const bMesh = new THREE.Mesh(bGeo, bMat);
          bMesh.position.set(b.posX, b.posY + 0.1, b.posZ);
          bananaGroup.add(bMesh);
          bananasMap.set(b.id, bMesh);
        }
      });
    };

    if (roomRef.current) {
      syncBananas(roomRef.current.bananas);
    }

    // --- 6. KARTS MODELLING FOR PEERS & SELF ---
    const kartsMap = new Map<string, {
      mesh: THREE.Group;
      wheels: THREE.Mesh[];
      nozzle: THREE.Mesh;
      color: string;
      isSelf: boolean;
      state: any;
    }>();

    const buildVisualKart = (colorHex: string, isSelf: boolean) => {
      const group = new THREE.Group();

      // Main chassis
      const bodyGeo = new THREE.BoxGeometry(2.5, 0.65, 4.0);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(colorHex),
        metalness: 0.85,
        roughness: 0.15,
      });
      const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
      bodyMesh.position.y = 0.45;
      bodyMesh.castShadow = true;
      group.add(bodyMesh);

      // Nose bumper
      const frontGeo = new THREE.BoxGeometry(2.4, 0.35, 1.2);
      const frontMesh = new THREE.Mesh(frontGeo, bodyMat);
      frontMesh.position.set(0, 0.3, 2.1);
      frontMesh.castShadow = true;
      group.add(frontMesh);

      // Rear Spoiler wing
      const wingGeo = new THREE.BoxGeometry(3.0, 0.25, 0.9);
      const wingMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.45 });
      const mainWing = new THREE.Mesh(wingGeo, wingMat);
      mainWing.position.set(0, 1.6, -2.0);

      const postGeo = new THREE.BoxGeometry(0.2, 1.2, 0.2);
      const pL = new THREE.Mesh(postGeo, wingMat);
      pL.position.set(-1.0, 0.9, -1.9);
      const pR = pL.clone();
      pR.position.x = 1.0;

      group.add(mainWing, pL, pR);

      // Black rubber wheels (rotating)
      const whGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.55, 12);
      whGeo.rotateZ(Math.PI / 2);
      const whMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.85 });

      const wheels: THREE.Mesh[] = [];
      const whPositions = [
        [-1.3, 0.45, 1.3],   // Forward Left
        [1.3, 0.45, 1.3],    // Forward Right
        [-1.3, 0.45, -1.3],  // Aft Left
        [1.3, 0.45, -1.3],   // Aft Right
      ];

      whPositions.forEach((pos) => {
        const wheel = new THREE.Mesh(whGeo, whMat);
        wheel.position.set(pos[0], pos[1], pos[2]);
        wheel.castShadow = true;
        group.add(wheel);
        wheels.push(wheel);
      });

      // Simple yellow/pink rear exhaust jet nozzle
      const nzGeo = new THREE.CylinderGeometry(0.18, 0.32, 0.72, 8);
      nzGeo.rotateX(Math.PI / 2);
      const nzMat = new THREE.MeshBasicMaterial({ color: isSelf ? 0xff007f : 0xfacc15 });
      const nozzle = new THREE.Mesh(nzGeo, nzMat);
      nozzle.position.set(0, 0.5, -2.1);
      group.add(nozzle);

      scene.add(group);
      return { group, wheels, nozzle };
    };

    // --- 7. PARTICLE SPARK SYSTEM ---
    const createExhaustSmoke = (pos: THREE.Vector3, color: number = 0xffffff, scale: number = 0.55) => {
      const sparkGeo = new THREE.DodecahedronGeometry(scale, 1);
      const sparkMat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.9,
      });
      const p = new THREE.Mesh(sparkGeo, sparkMat);
      p.position.copy(pos);
      p.userData = {
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 0.16,
          (Math.random() * 0.1) + 0.08,
          (Math.random() - 0.5) * 0.16
        ),
        life: 1.0,
        decay: 0.05,
      };
      scene.add(p);
      particleGroup.push(p);
    };

    const createFlameSpark = (pos: THREE.Vector3, dir: THREE.Vector3, isSelf: boolean) => {
      const coneGeo = new THREE.ConeGeometry(0.3, 1.3, 4);
      coneGeo.rotateX(-Math.PI / 2);
      const coneMat = new THREE.MeshBasicMaterial({
        color: isSelf ? (Math.random() > 0.4 ? 0xff007f : 0x22d3ee) : (Math.random() > 0.4 ? 0xf43f5e : 0xfacc15),
        transparent: true,
        opacity: 0.9,
      });
      const p = new THREE.Mesh(coneGeo, coneMat);
      p.position.copy(pos);
      p.lookAt(pos.clone().add(dir));
      p.userData = {
        vel: dir.clone().multiplyScalar(-2.0).add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.2,
          (Math.random() - 0.5) * 0.2,
          (Math.random() - 0.5) * 0.15
        )),
        life: 1.0,
        decay: 0.12,
      };
      scene.add(p);
      particleGroup.push(p);
    };

    // --- 8. REFINED DRIVING PHYSICS ENGINE ---
    const physics = {
      speed: 0,
      maxSpeed: 1.15, // Smooth base speed limit
      accel: 0.02,
      decel: 0.006,
      brakeDecel: 0.012,
      friction: 0.985,
      angle: 0,
      turnSpeed: 0.032,
      isDrifting: false,
      driftDirection: 0,
      driftAngle: 0,
      boosterGauge: 0,
      boosterStock: 0,
      boosterTimer: 0,
      currentLap: 1,
      progress: 0,
      spinTimer: 0,
      lapCheckpoints: [false, false] as [boolean, boolean],
    };

    // Initialize player at the starting grid
    const startPos = trackSpline.getPointAt(0);
    const startDir = trackSpline.getTangentAt(0).normalize();
    physics.angle = Math.atan2(startDir.x, startDir.z);

    // Track state sync cycles
    let tickCount = 0;

    // --- 9. HIGH-FREQUENCY ANIMATION LOOP ---
    let frameId: number;
    let isActive = true;

    // Initialize Audio Engine once the user starts moving
    AudioEngine.startEngine();

    const loop = () => {
      if (!isActive) return;
      frameId = requestAnimationFrame(loop);

      const currentRoom = roomRef.current;
      if (!currentRoom) {
        renderer.render(scene, camera);
        return;
      }

      // Synchronize box rendering structures inside loops
      syncItemBoxes(currentRoom.itemBoxes);
      syncBananas(currentRoom.bananas);

      // Re-create missing karts dynamically
      currentRoom.players.forEach((pState) => {
        if (!kartsMap.has(pState.id)) {
          console.log(`[ThreeGame] Creating visual kart mesh for racer: ${pState.name} (${pState.color})`);
          const visual = buildVisualKart(pState.color, pState.id === selfPlayerId);
          kartsMap.set(pState.id, {
            mesh: visual.group,
            wheels: visual.wheels,
            nozzle: visual.nozzle,
            color: pState.color,
            isSelf: pState.id === selfPlayerId,
            state: { ...pState },
          });
        }
      });

      // Purge karts for departed players
      kartsMap.forEach((kartDetails, id) => {
        if (!currentRoom.players.some((p) => p.id === id)) {
          scene.remove(kartDetails.mesh);
          // dispose geometry/materials
          kartDetails.mesh.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
              } else {
                child.material.dispose();
              }
            }
          });
          kartsMap.delete(id);
        }
      });

      // --- 9A. DRIVE VEHICLE (SELF PHYSICS) ---
      const selfKart = kartsMap.get(selfPlayerId);
      if (selfKart && currentRoom.status === 'racing' && !selfKart.state.finished) {
        // Evaluate active speed caps
        let currentLimit = physics.maxSpeed;
        if (boosterActiveRef.current) {
          currentLimit = physics.maxSpeed * 1.5;
          physics.boosterTimer--;

          // Emit sparks
          const nozzleWorldPos = new THREE.Vector3(0, 0.4, -2.0).applyMatrix4(selfKart.mesh.matrixWorld);
          const headVec = new THREE.Vector3(Math.sin(physics.angle), 0, Math.cos(physics.angle));
          createFlameSpark(nozzleWorldPos, headVec, true);

          if (physics.boosterTimer <= 0) {
            setBoosterActive(false);
          }
        }

        // Process directional input controls
        const goForward = keysRef.current['ArrowUp'] || keysRef.current['w'] || isMobileSteer.gas;
        const goBackward = keysRef.current['ArrowDown'] || keysRef.current['s'] || isMobileSteer.brake;
        const steerLeft = keysRef.current['ArrowLeft'] || keysRef.current['a'] || isMobileSteer.left;
        const steerRight = keysRef.current['ArrowRight'] || keysRef.current['d'] || isMobileSteer.right;
        const isDriftingPressed = keysRef.current['Shift'] || isMobileSteer.drift;

        if (goForward) {
          physics.speed += physics.accel;
          if (physics.speed > currentLimit) physics.speed = currentLimit;
        } else if (goBackward) {
          physics.speed -= physics.brakeDecel;
          if (physics.speed < -0.28) physics.speed = -0.28;
        } else {
          physics.speed *= physics.friction;
        }

        let angleDiff = 0;
        if (Math.abs(physics.speed) > 0.04) {
          const steerSign = physics.speed > 0 ? 1 : -1;
          if (steerLeft) angleDiff = physics.turnSpeed * steerSign;
          if (steerRight) angleDiff = -physics.turnSpeed * steerSign;
        }

        // Drift physics calculation
        if (isDriftingPressed && Math.abs(angleDiff) > 0 && physics.speed > 0.28) {
          if (!physics.isDrifting) {
            physics.isDrifting = true;
            physics.driftDirection = angleDiff > 0 ? 1 : -1;
            AudioEngine.playDrift();
            showComicPop('DRIFT!', '#ff007f');
          }

          angleDiff *= 1.48; // sharper drift steering
          physics.driftAngle = -physics.driftDirection * 0.46;

          // Back exhaust smokey traces
          const tireWorldPosL = new THREE.Vector3(-1.2, 0.1, -1.3).applyMatrix4(selfKart.mesh.matrixWorld);
          createExhaustSmoke(tireWorldPosL, 0xff007f, 0.38);
          const tireWorldPosR = new THREE.Vector3(1.2, 0.1, -1.3).applyMatrix4(selfKart.mesh.matrixWorld);
          createExhaustSmoke(tireWorldPosR, 0xff007f, 0.38);

          // Charge booster gauge if speed mode
          if (currentRoom.mode === 'speed') {
            physics.boosterGauge += 1.6;
            if (physics.boosterGauge >= 100) {
              physics.boosterGauge = 0;
              physics.boosterStock++;
              AudioEngine.playItemPickup();
              showComicPop('CHARGE!', '#22d3ee');
            }
          }
        } else {
          physics.isDrifting = false;
          physics.driftAngle *= 0.82;
        }

        // Update heading values
        physics.angle += angleDiff;
        selfKart.mesh.rotation.y = physics.angle + physics.driftAngle;

        // Spin wheels visually
        selfKart.wheels.forEach((w) => {
          w.rotation.x += physics.speed * 1.6;
        });

        // Handle visual spin penalty
        if (physics.spinTimer > 0) {
          physics.spinTimer--;
          selfKart.mesh.rotation.y += 0.35;
          physics.speed = 0.02;
        } else {
          const vx = Math.sin(physics.angle) * physics.speed;
          const vz = Math.cos(physics.angle) * physics.speed;
          selfKart.mesh.position.x += vx;
          selfKart.mesh.position.z += vz;
        }

        // --- 9B. OUT-OF-BOUNDS DETECTION / CLIPPING RESTRICTIONS ---
        let closestT = 0;
        let minDist = Infinity;
        for (let i = 0; i < 120; i++) {
          const tVal = i / 120;
          const roadPoint = trackSpline.getPointAt(tVal);
          const d = selfKart.mesh.position.distanceTo(roadPoint);
          if (d < minDist) {
            minDist = d;
            closestT = tVal;
          }
        }

        physics.progress = closestT;
        selfKart.mesh.position.y = 0; // lock flat coordinate

        // Prevent boundary crossing (13.5m radius from ribbon spine)
        const matchedCenter = trackSpline.getPointAt(closestT);
        const playerDist = selfKart.mesh.position.distanceTo(matchedCenter);
        if (playerDist > 13.5) {
          const pushVec = new THREE.Vector3().subVectors(selfKart.mesh.position, matchedCenter);
          pushVec.y = 0;
          pushVec.normalize();
          selfKart.mesh.position.copy(matchedCenter).add(pushVec.multiplyScalar(13.5));

          if (physics.speed > 0.16) {
            physics.speed = -0.2 * physics.speed; // bounce back
            AudioEngine.playCrash();
            showComicPop('BOOM!!!', '#facc15');

            // emit smoke collision bits
            for (let i = 0; i < 5; i++) {
              createExhaustSmoke(selfKart.mesh.position, 0xfacc15, 0.5);
            }
          } else {
            physics.speed *= 0.5;
          }
        }

        // Sfx pitch modulation
        AudioEngine.updateEngine(Math.abs(physics.speed) / physics.maxSpeed);

        // Track checkpoints & cross start/finish lines
        if (closestT > 0.42 && closestT < 0.58) {
          physics.lapCheckpoints[0] = true;
        }
        if (closestT > 0.78 && closestT < 0.88) {
          physics.lapCheckpoints[1] = true;
        }

        // Cross finish lines
        if (closestT > 0.96 && physics.lapCheckpoints[0] && physics.lapCheckpoints[1]) {
          physics.lapCheckpoints = [false, false];
          physics.currentLap++;

          if (physics.currentLap > 3) {
            onCrossLap(3); // player finished!
          } else {
            onCrossLap(physics.currentLap);
            showComicPop(`LAP ${physics.currentLap}!`, '#be185d');
          }
        }

        // Feed HUD parameters back to layout
        setHUDState({
          speed: Math.floor((Math.abs(physics.speed) / physics.maxSpeed) * 210),
          gauge: physics.boosterGauge,
          stock: physics.boosterStock,
          lap: Math.min(physics.currentLap, 3),
        });

        // --- 9C. HIGH-RATE WEB SYNCHRONIZATION ---
        tickCount++;
        if (tickCount % 2 === 0) {
          onSyncPhysics({
            posX: selfKart.mesh.position.x,
            posY: selfKart.mesh.position.y,
            posZ: selfKart.mesh.position.z,
            rotY: selfKart.mesh.rotation.y,
            speed: physics.speed,
            isDrifting: physics.isDrifting,
            driftAngle: physics.driftAngle,
            boosterActive: boosterActiveRef.current,
            shieldActive: shieldActiveRef.current,
            currentLap: physics.currentLap,
            progress: physics.progress,
            spinTimer: physics.spinTimer,
            finished: selfKart.state.finished,
          });
        }

        // Check clientside collision with items and active bananas
        currentRoom.itemBoxes.forEach((box) => {
          if (box.active && selfKart.mesh.position.distanceTo(boxesMap.get(box.id)!.position) < 3.0) {
            onCollectBox(box.id);
          }
        });

        // check collisions with bananas locally
        currentRoom.bananas.forEach((banana) => {
          const bananaMesh = bananasMap.get(banana.id);
          if (bananaMesh && selfKart.mesh.position.distanceTo(bananaMesh.position) < 2.0) {
            // Send damage notifier
            window.dispatchEvent(new CustomEvent('player_hit_banana', { detail: { id: banana.id } }));
          }
        });

        // Enable trigger keyboard booster if stock is available
        if (keysRef.current[' '] && physics.boosterStock > 0 && !boosterActiveRef.current) {
          physics.boosterStock--;
          setBoosterActive(true);
          physics.boosterTimer = 180;
          AudioEngine.playBoost();
          showComicPop('BOOST!!!', '#ec4899');
          keysRef.current[' '] = false; // avoid tapping too fast
        }

        // Listen for item box drop events
        const triggerDropHandler = () => {
          const heading = new THREE.Vector3(Math.sin(physics.angle), 0, Math.cos(physics.angle));
          const dropPos = selfKart.mesh.position.clone().sub(heading.multiplyScalar(4.0));
          onDropBanana({
            posX: dropPos.x,
            posY: dropPos.y,
            posZ: dropPos.z,
          });
        };

        const triggerSpinoutHandler = () => {
          physics.spinTimer = 60;
          AudioEngine.playCrash();
          showComicPop('SLIP!!!', '#fdba74');
        };

        // Attach listeners onto global windows for communication
        (window as any).triggerDropBanana = triggerDropHandler;
        (window as any).triggerLocalSpinout = triggerSpinoutHandler;
      }

      // --- 9D. SMOOTH INTERPOLATION FOR PEER PLAYER STATES ---
      currentRoom.players.forEach((pState) => {
        if (pState.id === selfPlayerId) return; // handled locally

        const peerKart = kartsMap.get(pState.id);
        if (peerKart) {
          // Check for physics updates received over WebSocket
          const pUpdate = peerPhysicsUpdates.current.get(pState.id);
          if (pUpdate) {
            // Blend/lerp coordinates smoothly
            peerKart.mesh.position.lerp(new THREE.Vector3(pUpdate.posX, pUpdate.posY, pUpdate.posZ), 0.32);
            
            // Handle angle discontinuity safely using quaternions or lerps
            peerKart.mesh.rotation.y = THREE.MathUtils.lerp(peerKart.mesh.rotation.y, pUpdate.rotY, 0.4);
            peerKart.state.finished = pUpdate.finished;
            peerKart.state.currentLap = pUpdate.currentLap;
            peerKart.state.progress = pUpdate.progress;

            // Animate peer smoke/fire
            if (pUpdate.boosterActive) {
              const nzWorldPos = new THREE.Vector3(0, 0.4, -2.0).applyMatrix4(peerKart.mesh.matrixWorld);
              const nozzleDir = new THREE.Vector3(Math.sin(pUpdate.rotY), 0, Math.cos(pUpdate.rotY));
              createFlameSpark(nzWorldPos, nozzleDir, false);
            }
            if (pUpdate.isDrifting) {
              const tireWorldPos = new THREE.Vector3(-1.2, 0.1, -1.3).applyMatrix4(peerKart.mesh.matrixWorld);
              createExhaustSmoke(tireWorldPos, 0xf43f5e, 0.32);
            }
          } else {
            // AI Fallback movement: If AI coordinate is missing, compute standard spline movement
            if (pState.isAI) {
              const point = trackSpline.getPointAt(pState.progress);
              
              // Orient look angle correctly
              const oldPos = peerKart.mesh.position.clone();
              peerKart.mesh.position.lerp(point, 0.2);
              peerKart.mesh.position.y = 0;
              
              const headingAngle = Math.atan2(point.x - oldPos.x, point.z - oldPos.z);
              if (point.distanceTo(oldPos) > 0.05) {
                peerKart.mesh.rotation.y = headingAngle;
              }
            }
          }

          // Spin wheels
          peerKart.wheels.forEach((w) => {
            w.rotation.x += 0.6;
          });
        }
      });

      // --- 9E. UPDATE RUNNING PARTICLE LIFE ---
      for (let i = particleGroup.length - 1; i >= 0; i--) {
        const p = particleGroup[i];
        p.position.add(p.userData.vel);
        p.userData.life -= p.userData.decay;

        p.scale.setScalar(p.userData.life);
        const mat = p.material as THREE.MeshBasicMaterial;
        if (mat && !Array.isArray(mat)) {
          mat.opacity = p.userData.life;
        }

        if (p.userData.life <= 0) {
          scene.remove(p);
          p.geometry.dispose();
          if (Array.isArray(p.material)) {
            p.material.forEach(m => m.dispose());
          } else {
            p.material.dispose();
          }
          particleGroup.splice(i, 1);
        }
      }

      // --- 9F. DYNAMIC SPECTATOR CAMERA (3 VIEWMODES) ---
      if (selfKart) {
        const backX = Math.sin(physics.angle + physics.driftAngle);
        const backZ = Math.cos(physics.angle + physics.driftAngle);

        // Adjust FOV according to speed index
        const peakFov = 65 + (Math.abs(physics.speed) / physics.maxSpeed) * 22;
        camera.fov = THREE.MathUtils.lerp(camera.fov, peakFov, 0.08);
        camera.updateProjectionMatrix();

        // Cam Shake
        let shake = 0;
        if (boosterActiveRef.current) {
          shake = 0.14;
        } else if (physics.speed > 0.8) {
          shake = 0.04;
        }
        const shakeOfs = new THREE.Vector3(
          (Math.random() - 0.5) * shake,
          (Math.random() - 0.5) * shake,
          (Math.random() - 0.5) * shake
        );

        if (cameraTypeRef.current === 'isometric') {
          // 2.5d high angles
          const targetCam = new THREE.Vector3(
            selfKart.mesh.position.x - backX * 11 + 7,
            11.0,
            selfKart.mesh.position.z - backZ * 11 + 7
          );
          camera.position.lerp(targetCam, 0.08).add(shakeOfs);
          camera.lookAt(selfKart.mesh.position);
        } else if (cameraTypeRef.current === 'chase') {
          // Retro third-person arcade follow
          const targetCam = new THREE.Vector3(
            selfKart.mesh.position.x - backX * 8.5,
            4.0,
            selfKart.mesh.position.z - backZ * 8.5
          );
          camera.position.lerp(targetCam, 0.12).add(shakeOfs);
          camera.lookAt(selfKart.mesh.position.clone().add(new THREE.Vector3(0, 0.9, 0)));
        } else {
          // Cockpit perspective
          const noseVec = new THREE.Vector3(backX * 0.45, 1.15, backZ * 0.45);
          camera.position.copy(selfKart.mesh.position).add(noseVec).add(shakeOfs);
          const lookT = selfKart.mesh.position.clone().add(new THREE.Vector3(backX * 11, 0.8, backZ * 11));
          camera.lookAt(lookT);
        }
      }

      renderer.render(scene, camera);
    };

    loop();

    // Resize event
    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // --- 10. DECONSTRUCTION CLEANUP ---
    return () => {
      isActive = false;
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      AudioEngine.stopEngine();

      delete (window as any).triggerDropBanana;
      delete (window as any).triggerLocalSpinout;

      // Dispose all active objects
      roadGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      decorationGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      boxesGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      bananaGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      particleGroup.forEach((mesh) => {
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material.dispose();
        }
      });

      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [selfPlayerId]);

  return <div ref={mountRef} className="w-full h-full bg-[#030408]" id="three-webgl-wrapper" />;
};
