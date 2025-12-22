import React, { useState, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { 
  OrbitControls, 
  Image as DreiImage, 
  Text, 
  Float,
  PointMaterial,
  Points,
  useCursor
} from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { easing } from 'maath'

// --- ⚙️ 全局配置 ---
const CONFIG = {
  counts: {
    foliage: 6000,     // 树叶粒子 (绿色)
    lights: 2000,      // 彩灯粒子 (红/黄)
    ornaments: 80,     // 照片数量 (循环复用)
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
    // 圆锥体 (树)
    const y = Math.random() * CONFIG.tree.height - CONFIG.tree.height / 2
    const r = (1 - (y + CONFIG.tree.height / 2) / CONFIG.tree.height) * CONFIG.tree.radius
    const rRandom = r + (Math.random() - 0.5) * 0.5 
    const angle = Math.random() * Math.PI * 2
    return new THREE.Vector3(Math.cos(angle) * rRandom, y, Math.sin(angle) * rRandom)
  } else {
    // 球体 (散开)
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

// --- 🌲 核心粒子树 (已修复构建报错) ---
function TreeParticles({ isDispersed, onClickTree }: { isDispersed: boolean, onClickTree: () => void }) {
  const ref = useRef<THREE.Points>(null)
  const { setHovered } = useCursorState()
  const totalCount = CONFIG.counts.foliage + CONFIG.counts.lights

  // 1. 初始化数据
  const [treePositions, dispersedPositions, colors] = useMemo(() => {
    const tree = new Float32Array(totalCount * 3)
    const dispersed = new Float32Array(totalCount * 3)
    const col = new Float32Array(totalCount * 3)
    const colorHelper = new THREE.Color()

    for (let i = 0; i < totalCount; i++) {
      // 位置
      const tPos = calculateTargetPosition(i, totalCount, 'tree')
      tree[i*3] = tPos.x; tree[i*3+1] = tPos.y; tree[i*3+2] = tPos.z

      const dPos = calculateTargetPosition(i, totalCount, 'dispersed')
      dispersed[i*3] = dPos.x; dispersed[i*3+1] = dPos.y; dispersed[i*3+2] = dPos.z

      // 颜色
      if (i < CONFIG.counts.foliage) {
        // 绿色叶子
        colorHelper.setHSL(0.3, 0.8, 0.3 + Math.random() * 0.2)
      } else {
        // 彩灯 (更亮)
        if (Math.random() > 0.5) colorHelper.setHex(0xff2222) // 红
        else colorHelper.setHex(0xffaa00) // 金
      }
      col[i*3] = colorHelper.r; col[i*3+1] = colorHelper.g; col[i*3+2] = colorHelper.b
    }
    return [tree, dispersed, col]
  }, [])

  // 2. 动画循环
  useFrame((state, delta) => {
    if (!ref.current) return
    const currentPositions = ref.current.geometry.attributes.position.array as Float32Array
    const target = isDispersed ? dispersedPositions : treePositions

    // ✅ 修复点：使用内联 Math.lerp 替代 easing.damp 处理数组
    // 这样既解决了类型报错，性能也比调用 24000 次函数更好
    // t 是平滑系数，越大越快。4 * delta 大约 0.2-0.3秒回归
    const t = delta * 4
    for (let i = 0; i < currentPositions.length; i++) {
      currentPositions[i] = THREE.MathUtils.lerp(currentPositions[i], target[i], t)
    }
    
    ref.current.geometry.attributes.position.needsUpdate = true
    
    // 旋转
    ref.current.rotation.y += delta * (isDispersed ? 0.02 : 0.1)
  })

  return (
    <Points 
      ref={ref} 
      positions={treePositions} 
      colors={colors}
      stride={3} 
      onClick={(e) => {
        if (!isDispersed) {
            e.stopPropagation()
            onClickTree()
        }
      }}
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
    type: Math.random() > 0.5 ? 0 : 1, // 0:球, 1:方块
    scale: 0.3 + Math.random() * 0.3
  })), [])

  return (
    <group>
      {data.map((d, i) => (
        <ShapeMesh key={i} data={d} isDispersed={isDispersed} />
      ))}
    </group>
  )
}

function ShapeMesh({ data, isDispersed }: { data: any, isDispersed: boolean }) {
    const ref = useRef<THREE.Mesh>(null)
    
    useFrame((state, delta) => {
        if (!ref.current) return
        const target = isDispersed ? data.dispersedPos : data.treePos
        // 这里可以直接用 damp3，因为 position 是 Vector3
        easing.damp3(ref.current.position, target, 0.4, delta)
        ref.current.rotation.x += delta * 0.5
        ref.current.rotation.y += delta * 0.5
    })

    return (
        <mesh ref={ref} scale={data.scale}>
            {data.type === 0 ? <sphereGeometry args={[0.4, 16, 16]} /> : <boxGeometry args={[0.5, 0.5, 0.5]} />}
            <meshStandardMaterial 
                color={data.type === 0 ? "#ff2222" : "#ffcc00"} 
                emissive={data.type === 0 ? "#880000" : "#aa5500"}
                roughness={0.3}
            />
        </mesh>
    )
}

// --- 🖼️ 照片组件 ---
function InteractablePhoto({ 
  url, index, isDispersed, activeId, setActiveId 
}: { 
  url: string, index: number, isDispersed: boolean, 
  activeId: number | null, setActiveId: (id: number | null) => void 
}) {
  const ref = useRef<THREE.Group>(null)
  const isActive = activeId === index
  const isOtherActive = activeId !== null && activeId !== index
  const { setHovered } = useCursorState()

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

    easing.damp3(ref.current.position, dest, 0.4, delta)
    easing.damp3(ref.current.scale, [destScale, destScale, 1], 0.3, delta)
    if (isActive) easing.dampE(ref.current.rotation, destRot, 0.4, delta)
    else {
        ref.current.rotation.y += delta * 0.1
        if(isDispersed && !isActive) ref.current.lookAt(state.camera.position)
    }
  })

  return (
    <group ref={ref}>
      <DreiImage 
        url={url} 
        transparent 
        side={THREE.DoubleSide}
        onPointerOver={() => isDispersed && !activeId && setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation()
          if (!isDispersed) return 
          setActiveId(isActive ? null : index)
        }}
      />
    </group>
  )
}

// --- ✨ 文字组件 ---
function TitleText({ visible }: { visible: boolean }) {
  return (
    <group visible={visible}>
      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
        <Text
          position={[0, CONFIG.tree.height / 2 + 3, 0]}
          fontSize={CONFIG.text.size}
          color={CONFIG.text.color}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.05}
          outlineColor="#884400"
        >
          {CONFIG.text.content}
        </Text>
      </Float>
    </group>
  )
}

// --- 🖱️ 鼠标状态 ---
function useCursorState() {
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)
  return { hovered, setHovered }
}

// --- 📱 UI 覆盖层 ---
function Overlay({ isDispersed, toggle, hasActivePhoto }: { isDispersed: boolean, toggle: () => void, hasActivePhoto: boolean }) {
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, padding: '40px',
      display: 'flex', justifyContent: 'flex-end', pointerEvents: 'none'
    }}>
      {!hasActivePhoto && (
        <button
          onClick={toggle}
          style={{
            pointerEvents: 'auto',
            background: isDispersed ? 'rgba(255, 50, 50, 0.8)' : 'rgba(10, 150, 50, 0.8)',
            color: 'white', border: '2px solid rgba(255,255,255,0.5)',
            padding: '12px 30px', fontSize: '18px', fontWeight: 'bold', borderRadius: '50px',
            cursor: 'pointer', backdropFilter: 'blur(4px)',
            boxShadow: '0 4px 15px rgba(0,0,0,0.3)', textTransform: 'uppercase', letterSpacing: '1px'
          }}
        >
          {isDispersed ? "Close Gallery" : "Open Tree 🎄"}
        </button>
      )}
      <div style={{
        position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)',
        color: 'rgba(255,255,255,0.6)', fontSize: '14px',
        opacity: isDispersed && !hasActivePhoto ? 1 : 0, transition: 'opacity 0.5s'
      }}>
        Click a photo to zoom • Drag to rotate
      </div>
    </div>
  )
}

// --- 🚀 主入口 ---
export default function App() {
  const [isDispersed, setIsDispersed] = useState(false)
  const [activePhotoId, setActivePhotoId] = useState<number | null>(null)

  const photos = useMemo(() => 
    Array.from({ length: CONFIG.counts.ornaments }, (_, i) => {
      const fileIndex = (i % 11) + 1 
      return `/photos/${fileIndex}.jpg`
    }), 
  [])

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#020205', overflow: 'hidden' }}>
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 0, 35], fov: 35 }}>
        <color attach="background" args={['#020205']} />
        <ambientLight intensity={0.4} />
        <pointLight position={[10, 20, 10]} intensity={1.5} color="#ffddaa" />
        
        {/* 粒子树 */}
        <TreeParticles isDispersed={isDispersed} onClickTree={() => setIsDispersed(true)} />
        
        {/* 3D 形状 */}
        <GeometricOrnaments isDispersed={isDispersed} />

        {/* 照片墙 */}
        {photos.map((url, i) => (
          <InteractablePhoto 
            key={i} index={i} url={url} 
            isDispersed={isDispersed} activeId={activePhotoId} setActiveId={setActivePhotoId}
          />
        ))}

        <TitleText visible={!isDispersed} />

        <OrbitControls 
          enablePan={false} enableZoom={true} 
          minDistance={10} maxDistance={60}
          autoRotate={!activePhotoId} 
          autoRotateSpeed={isDispersed ? 0.3 : 1.5} 
          enabled={!activePhotoId}
        />

        <EffectComposer enableNormalPass={false}>
          <Bloom luminanceThreshold={0.2} mipmapBlur intensity={1.5} radius={0.5} />
          <Vignette eskil={false} offset={0.1} darkness={1.1} />
        </EffectComposer>
      </Canvas>
      <Overlay isDispersed={isDispersed} toggle={() => { setIsDispersed(p => !p); setActivePhotoId(null); }} hasActivePhoto={activePhotoId !== null} />
    </div>
  )
}