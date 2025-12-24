import React, { useState, useMemo, useRef, Suspense } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { 
  OrbitControls, 
  Image as DreiImage, 
  Text, 
  Float,
  PointMaterial,
  Points,
  useCursor,
  Html
} from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'

// --- ⚙️ 全局配置 ---
const CONFIG = {
  counts: {
    foliage: 6000,     // 树叶粒子
    lights: 2000,      // 彩灯粒子
    ornaments: 80,     // 照片数量
    shapes: 250        // 3D 几何体
  },
  tree: { 
    height: 18, 
    radius: 7.5,
  },
  text: {
    content: "MERRY\nCHRISTMAS",
    color: '#ffcc00',
    size: 2.2
  }
}

// --- 🎨 辅助函数：生成位置 ---
const calculateTargetPosition = (i: number, count: number, type: 'tree' | 'dispersed') => {
  if (type === 'tree') {
    const y = Math.random() * CONFIG.tree.height - CONFIG.tree.height / 2
    const r = (1 - (y + CONFIG.tree.height / 2) / CONFIG.tree.height) * CONFIG.tree.radius
    const rRandom = r + (Math.random() - 0.5) * 0.5 
    const angle = Math.random() * Math.PI * 2
    return new THREE.Vector3(Math.cos(angle) * rRandom, y, Math.sin(angle) * rRandom)
  } else {
    const r = 15 + Math.random() * 25 
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    return new THREE.Vector3(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi)
    )
  }
}

// --- 🌲 核心粒子树 (彻底修复回归问题) ---
function TreeParticles({ isDispersed, onClickTree }: { isDispersed: boolean, onClickTree: () => void }) {
  const ref = useRef<THREE.Points>(null)
  const { setHovered } = useCursorState()
  const totalCount = CONFIG.counts.foliage + CONFIG.counts.lights

  // 1. 生成原始数据 (只读数据，绝对不可修改)
  const sourceData = useMemo(() => {
    const tree = new Float32Array(totalCount * 3)
    const dispersed = new Float32Array(totalCount * 3)
    const col = new Float32Array(totalCount * 3)
    const colorHelper = new THREE.Color()

    for (let i = 0; i < totalCount; i++) {
      // 树形态
      const tPos = calculateTargetPosition(i, totalCount, 'tree')
      tree[i*3] = tPos.x; tree[i*3+1] = tPos.y; tree[i*3+2] = tPos.z

      // 散开形态
      const dPos = calculateTargetPosition(i, totalCount, 'dispersed')
      dispersed[i*3] = dPos.x; dispersed[i*3+1] = dPos.y; dispersed[i*3+2] = dPos.z

      // 颜色
      if (i < CONFIG.counts.foliage) {
        colorHelper.setHSL(0.3, 0.8, 0.3 + Math.random() * 0.2)
      } else {
        if (Math.random() > 0.5) colorHelper.setHex(0xff2222) 
        else colorHelper.setHex(0xffaa00)
      }
      col[i*3] = colorHelper.r; col[i*3+1] = colorHelper.g; col[i*3+2] = colorHelper.b
    }
    return { tree, dispersed, col }
  }, [])

  // 2. 🚀 关键修复：克隆一份数据给渲染器使用
  // 这样 Three.js 修改 bufferPosition 时，sourceData.tree 保持纯净
  const bufferPositions = useMemo(() => Float32Array.from(sourceData.tree), [sourceData])

  // 3. 动画混合因子 (0 = 树, 1 = 散开)
  const mixRef = useRef(0)

  useFrame((state, delta) => {
    if (!ref.current) return
    const currentPositions = ref.current.geometry.attributes.position.array as Float32Array
    
    // 目标混合值
    const targetMix = isDispersed ? 1 : 0
    // 平滑插值混合因子
    mixRef.current = THREE.MathUtils.lerp(mixRef.current, targetMix, delta * 3.0)

    // 绝对位置计算：每一帧都基于“原始数据”重新计算
    // 公式：Pos = 原始树 + (原始散开 - 原始树) * 混合因子
    for (let i = 0; i < totalCount; i++) {
      const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2
      
      currentPositions[ix] = THREE.MathUtils.lerp(sourceData.tree[ix], sourceData.dispersed[ix], mixRef.current)
      currentPositions[iy] = THREE.MathUtils.lerp(sourceData.tree[iy], sourceData.dispersed[iy], mixRef.current)
      currentPositions[iz] = THREE.MathUtils.lerp(sourceData.tree[iz], sourceData.dispersed[iz], mixRef.current)
    }
    
    ref.current.geometry.attributes.position.needsUpdate = true
    ref.current.rotation.y += delta * (0.1 - mixRef.current * 0.08)
  })

  return (
    <Points 
      ref={ref} 
      positions={bufferPositions} // 使用克隆的 buffer
      colors={sourceData.col}
      stride={3} 
      onClick={(e) => { if (!isDispersed) { e.stopPropagation(); onClickTree() } }}
      onPointerOver={() => !isDispersed && setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <PointMaterial 
        vertexColors 
        transparent 
        color="#ffffff" 
        size={0.15} 
        sizeAttenuation={true} 
        depthWrite={false} 
        blending={THREE.AdditiveBlending} 
      />
    </Points>
  )
}

// --- 🧊 3D 几何装饰 ---
function GeometricOrnaments({ isDispersed }: { isDispersed: boolean }) {
  const count = CONFIG.counts.shapes
  const data = useMemo(() => Array.from({ length: count }, (_, i) => ({
    treePos: calculateTargetPosition(i, count, 'tree'),
    dispersedPos: calculateTargetPosition(i, count, 'dispersed'),
    type: Math.random() > 0.5 ? 0 : 1,
    scale: 0.3 + Math.random() * 0.3
  })), [])

  return (
    <group>
      {data.map((d, i) => <ShapeMesh key={i} data={d} isDispersed={isDispersed} />)}
    </group>
  )
}

function ShapeMesh({ data, isDispersed }: { data: any, isDispersed: boolean }) {
    const ref = useRef<THREE.Mesh>(null)
    const mixRef = useRef(0)

    useFrame((state, delta) => {
        if (!ref.current) return
        const targetMix = isDispersed ? 1 : 0
        mixRef.current = THREE.MathUtils.lerp(mixRef.current, targetMix, delta * 3.0)
        
        // 几何体位置插值
        ref.current.position.lerpVectors(data.treePos, data.dispersedPos, mixRef.current)
        
        ref.current.rotation.x += delta * 0.5
        ref.current.rotation.y += delta * 0.5
    })
    return (
        <mesh ref={ref} scale={data.scale}>
            {data.type === 0 ? <sphereGeometry args={[0.4, 16, 16]} /> : <boxGeometry args={[0.5, 0.5, 0.5]} />}
            <meshStandardMaterial color={data.type === 0 ? "#ff2222" : "#ffcc00"} emissive={data.type === 0 ? "#880000" : "#aa5500"} roughness={0.3} />
        </mesh>
    )
}

// --- 🖼️ 照片组件 ---
function InteractablePhoto({ url, index, isDispersed, activeId, setActiveId }: any) {
  const ref = useRef<THREE.Group>(null)
  const isActive = activeId === index
  const isOtherActive = activeId !== null && activeId !== index
  const { setHovered } = useCursorState()
  
  // 用于平滑动画的当前位置/旋转状态
  // 这里我们不使用绝对 lerp，因为照片还需要处理点击放大的逻辑，使用阻尼(damp)效果更好
  const { treePos, dispersedPos } = useMemo(() => ({
    treePos: calculateTargetPosition(index, CONFIG.counts.ornaments, 'tree'),
    dispersedPos: calculateTargetPosition(index, CONFIG.counts.ornaments, 'dispersed')
  }), [])

  useFrame((state, delta) => {
    if (!ref.current) return
    let dest = isDispersed ? dispersedPos : treePos
    let destScale = isDispersed ? 1.5 : 0.8
    let destRot = new THREE.Euler(0, 0, 0)

    if (isActive) {
      const cam = state.camera
      const camDir = new THREE.Vector3()
      cam.getWorldDirection(camDir)
      dest = cam.position.clone().add(camDir.multiplyScalar(8))
      destScale = 4.5
      destRot = state.camera.rotation
    } else if (isOtherActive) {
      destScale = 0
    }

    // 手动实现简单的阻尼，避免 external library 版本问题
    // 位置
    ref.current.position.x += (dest.x - ref.current.position.x) * delta * 4
    ref.current.position.y += (dest.y - ref.current.position.y) * delta * 4
    ref.current.position.z += (dest.z - ref.current.position.z) * delta * 4
    
    // 缩放
    ref.current.scale.x += (destScale - ref.current.scale.x) * delta * 4
    ref.current.scale.y += (destScale - ref.current.scale.y) * delta * 4
    ref.current.scale.z += (1 - ref.current.scale.z) * delta * 4

    // 旋转
    if (isActive) {
        ref.current.rotation.x += (destRot.x - ref.current.rotation.x) * delta * 4
        ref.current.rotation.y += (destRot.y - ref.current.rotation.y) * delta * 4
        ref.current.rotation.z += (destRot.z - ref.current.rotation.z) * delta * 4
    } else {
        ref.current.rotation.y += delta * 0.1
        if(isDispersed && !isActive) ref.current.lookAt(state.camera.position)
    }
  })

  return (
    <group ref={ref}>
      <DreiImage 
        url={url} transparent side={THREE.DoubleSide}
        onPointerOver={() => isDispersed && !activeId && setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => { e.stopPropagation(); if (!isDispersed) return; setActiveId(isActive ? null : index) }}
      />
    </group>
  )
}

// --- 文字组件 ---
function TitleText({ visible }: { visible: boolean }) {
  return (
    <group visible={visible}>
      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
        <Text position={[0, CONFIG.tree.height / 2 + 3, 0]} fontSize={CONFIG.text.size} color={CONFIG.text.color} anchorX="center" anchorY="middle" outlineWidth={0.05} outlineColor="#884400">
          {CONFIG.text.content}
        </Text>
      </Float>
    </group>
  )
}

function useCursorState() {
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)
  return { hovered, setHovered }
}

function Overlay({ isDispersed, toggle, hasActivePhoto }: any) {
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '40px', display: 'flex', justifyContent: 'flex-end', pointerEvents: 'none' }}>
      {!hasActivePhoto && (
        <button onClick={toggle} style={{ pointerEvents: 'auto', background: isDispersed ? 'rgba(255, 50, 50, 0.8)' : 'rgba(10, 150, 50, 0.8)', color: 'white', border: '2px solid rgba(255,255,255,0.5)', padding: '12px 30px', fontSize: '18px', fontWeight: 'bold', borderRadius: '50px', cursor: 'pointer', backdropFilter: 'blur(4px)', boxShadow: '0 4px 15px rgba(0,0,0,0.3)', textTransform: 'uppercase', letterSpacing: '1px' }}>
          {isDispersed ? "Close Gallery" : "Open Tree 🎄"}
        </button>
      )}
      <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.6)', fontSize: '14px', opacity: isDispersed && !hasActivePhoto ? 1 : 0, transition: 'opacity 0.5s' }}>
        Click a photo to zoom • Drag to rotate
      </div>
    </div>
  )
}

// --- 主应用 ---
export default function App() {
  const [isDispersed, setIsDispersed] = useState(false)
  const [activePhotoId, setActivePhotoId] = useState<number | null>(null)
  const photos = useMemo(() => Array.from({ length: CONFIG.counts.ornaments }, (_, i) => `/photos/${(i % 11) + 1}.jpg`), [])

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#020205', overflow: 'hidden' }}>
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 0, 35], fov: 35 }}>
        <color attach="background" args={['#020205']} />
        
        <Suspense fallback={<Html center><div style={{color:'white', fontSize:'1.5rem'}}>Loading Christmas Magic...</div></Html>}>
            <ambientLight intensity={0.4} />
            <pointLight position={[10, 20, 10]} intensity={1.5} color="#ffddaa" />
            
            <TreeParticles isDispersed={isDispersed} onClickTree={() => setIsDispersed(true)} />
            <GeometricOrnaments isDispersed={isDispersed} />
            {photos.map((url, i) => (
              <InteractablePhoto key={i} index={i} url={url} isDispersed={isDispersed} activeId={activePhotoId} setActiveId={setActivePhotoId} />
            ))}
            <TitleText visible={!isDispersed} />
        </Suspense>

        <OrbitControls enablePan={false} enableZoom={true} minDistance={10} maxDistance={60} autoRotate={!activePhotoId} autoRotateSpeed={isDispersed ? 0.3 : 1.5} enabled={!activePhotoId} />
        <EffectComposer enableNormalPass={false}>
          <Bloom luminanceThreshold={0.2} mipmapBlur intensity={1.5} radius={0.5} />
          <Vignette eskil={false} offset={0.1} darkness={1.1} />
        </EffectComposer>
      </Canvas>
      <Overlay isDispersed={isDispersed} toggle={() => { setIsDispersed(p => !p); setActivePhotoId(null); }} hasActivePhoto={activePhotoId !== null} />
    </div>
  )
}