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
  useCursor,
  Instance,
  Instances
} from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { easing } from 'maath'

// --- ⚙️ 全局配置 ---
const CONFIG = {
  counts: {
    foliage: 6000,     // 树叶粒子 (绿色)
    lights: 2000,      // 彩灯粒子 (红/黄)
    ornaments: 80,     // 照片数量 (循环复用 31 张图)
    shapes: 250        // 额外的 3D 几何体 (球/方块)
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
// 生成圆锥体 (树) 或 球体 (散开) 的坐标
const calculateTargetPosition = (i: number, count: number, type: 'tree' | 'dispersed') => {
  if (type === 'tree') {
    // 圆锥体分布
    const y = Math.random() * CONFIG.tree.height - CONFIG.tree.height / 2
    const r = (1 - (y + CONFIG.tree.height / 2) / CONFIG.tree.height) * CONFIG.tree.radius
    // 增加一点随机性让树看起来更自然
    const rRandom = r + (Math.random() - 0.5) * 0.5 
    const angle = Math.random() * Math.PI * 2
    return new THREE.Vector3(Math.cos(angle) * rRandom, y, Math.sin(angle) * rRandom)
  } else {
    // 散开 (球体爆炸)
    const r = 15 + Math.random() * 25 // 扩散半径
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    return new THREE.Vector3(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi)
    )
  }
}

// --- 🌲 核心粒子树 (绿叶 + 彩灯) ---
function TreeParticles({ isDispersed, onClickTree }: { isDispersed: boolean, onClickTree: () => void }) {
  const ref = useRef<THREE.Points>(null)
  const { setHovered } = useCursorState()
  const totalCount = CONFIG.counts.foliage + CONFIG.counts.lights

  // 1. 初始化数据：生成两套坐标 (树/散开) 和 颜色
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

      // 颜色逻辑：前 foliage 个是绿色，后面的是 红/金 彩灯
      if (i < CONFIG.counts.foliage) {
        // 绿色区间，带一点点随机亮度
        colorHelper.setHSL(0.3, 0.8, 0.3 + Math.random() * 0.2)
      } else {
        // 彩灯区间：随机分配红色或金色
        if (Math.random() > 0.5) {
          colorHelper.setHex(0xff3333) // 红
        } else {
          colorHelper.setHex(0xffaa00) // 金
        }
      }
      col[i*3] = colorHelper.r; col[i*3+1] = colorHelper.g; col[i*3+2] = colorHelper.b
    }
    return [tree, dispersed, col]
  }, [])

  // 2. 动画循环：核心修复点 —— 使用 damp 确保回归
  useFrame((state, delta) => {
    if (!ref.current) return
    const currentPositions = ref.current.geometry.attributes.position.array as Float32Array
    const target = isDispersed ? dispersedPositions : treePositions

    // 遍历所有粒子进行插值
    for (let i = 0; i < totalCount; i++) {
      const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2
      // 手动实现简单的 lerp 以提高 8000+ 粒子的性能
      // 这里的 3.0 * delta 控制飞行速度
      const speed = 3.0 * delta
      currentPositions[ix] += (target[ix] - currentPositions[ix]) * speed
      currentPositions[iy] += (target[iy] - currentPositions[iy]) * speed
      currentPositions[iz] += (target[iz] - currentPositions[iz]) * speed
    }
    ref.current.geometry.attributes.position.needsUpdate = true
    
    // 整体自转
    ref.current.rotation.y += delta * (isDispersed ? 0.02 : 0.1)
  })

  return (
    <Points 
      ref={ref} 
      positions={treePositions} // 初始位置
      colors={colors}           // 注入颜色数组
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
        vertexColors // 👈 关键：开启顶点颜色
        transparent 
        size={0.15} 
        sizeAttenuation={true} 
        depthWrite={false} 
        blending={THREE.AdditiveBlending} 
      />
    </Points>
  )
}

// --- 🧊 3D 几何装饰 (红球/黄方块) ---
function GeometricOrnaments({ isDispersed }: { isDispersed: boolean }) {
  const count = CONFIG.counts.shapes
  
  // 生成数据
  const data = useMemo(() => Array.from({ length: count }, (_, i) => ({
    treePos: calculateTargetPosition(i, count, 'tree'),
    dispersedPos: calculateTargetPosition(i, count, 'dispersed'),
    // 随机分配形状类型：0=红球, 1=黄方块
    type: Math.random() > 0.5 ? 0 : 1, 
    scale: 0.3 + Math.random() * 0.3
  })), [])

  return (
    <group>
      {/* 红色球体组 */}
      <Instances range={count}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshStandardMaterial color="#ff2222" emissive="#550000" roughness={0.2} metalness={0.8} />
        {data.map((d, i) => d.type === 0 && (
          <FloatingShape key={i} data={d} isDispersed={isDispersed} />
        ))}
      </Instances>

      {/* 黄色方块组 */}
      <Instances range={count}>
        <boxGeometry args={[1.2, 1.2, 1.2]} />
        <meshStandardMaterial color="#ffcc00" emissive="#aa6600" roughness={0.1} metalness={0.9} />
        {data.map((d, i) => d.type === 1 && (
          <FloatingShape key={i} data={d} isDispersed={isDispersed} />
        ))}
      </Instances>
    </group>
  )
}

// 单个漂浮形状的动画组件
function FloatingShape({ data, isDispersed }: { data: any, isDispersed: boolean }) {
  const ref = useRef<THREE.Group>(null) // 使用 Group 包装 Instance 会有问题吗？Drei 的 Instance 是虚拟组件
  // 正确做法：Drei <Instance> 会将 ref 转发给内部逻辑
  // 但为了简化动画，我们这里直接计算位置传给 <Instance>
  // 不过 <Instance> 很难做独立的逐帧动画。
  // 为了效果好，这里我们改用稍微费一点性能但效果最好的方案：独立 Mesh 或者 简单的组件封装。
  // 为了性能平衡，我们还是用简单的组件，内部跑 useFrame。
  
  return (
      <ShapeMesh data={data} isDispersed={isDispersed} />
  )
}

function ShapeMesh({ data, isDispersed }: { data: any, isDispersed: boolean }) {
    const ref = useRef<THREE.Mesh>(null)
    
    useFrame((state, delta) => {
        if (!ref.current) return
        const target = isDispersed ? data.dispersedPos : data.treePos
        // 平滑移动
        easing.damp3(ref.current.position, target, 0.5, delta)
        // 旋转
        ref.current.rotation.x += delta * 0.5
        ref.current.rotation.y += delta * 0.5
    })

    // 根据类型渲染不同的几何体 (为了性能，其实应该用 InstancedMesh，但这里为了代码可读性和动画独立性，少量 Mesh 是可以接受的)
    // 优化：其实上面 GeometricOrnaments 里的 Instances 写法会导致重绘问题，
    // 我们这里直接渲染 Mesh 吧，250 个 Mesh 对现在的浏览器完全没问题。
    
    return (
        <mesh ref={ref} scale={data.scale}>
            {data.type === 0 ? <sphereGeometry args={[0.4, 16, 16]} /> : <boxGeometry args={[0.5, 0.5, 0.5]} />}
            <meshStandardMaterial 
                color={data.type === 0 ? "#ff2222" : "#ffcc00"} 
                emissive={data.type === 0 ? "#550000" : "#aa5500"}
                roughness={0.3}
            />
        </mesh>
    )
}


// --- 🖼️ 照片组件 (支持无限复用) ---
function InteractablePhoto({ 
  url, 
  index, // 这里的 index 是 0 到 79
  isDispersed, 
  activeId, 
  setActiveId 
}: { 
  url: string, 
  index: number, 
  isDispersed: boolean, 
  activeId: number | null, 
  setActiveId: (id: number | null) => void 
}) {
  const ref = useRef<THREE.Group>(null)
  const isActive = activeId === index
  const isOtherActive = activeId !== null && activeId !== index
  const { setHovered } = useCursorState()

  // 预计算位置
  const { treePos, dispersedPos } = useMemo(() => ({
    treePos: calculateTargetPosition(index, CONFIG.counts.ornaments, 'tree'),
    dispersedPos: calculateTargetPosition(index, CONFIG.counts.ornaments, 'dispersed')
  }), [])

  useFrame((state, delta) => {
    if (!ref.current) return

    let dest = isDispersed ? dispersedPos : treePos
    let destScale = isDispersed ? 1.5 : 0.8
    let destRot = new THREE.Euler(0, 0, 0)

    // 激活状态逻辑 (放大)
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

    // 动画
    easing.damp3(ref.current.position, dest, 0.4, delta)
    easing.damp3(ref.current.scale, [destScale, destScale, 1], 0.3, delta)
    if (isActive) {
        easing.dampE(ref.current.rotation, destRot, 0.4, delta)
    } else {
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
          // font="/fonts/Cinzel-Bold.ttf" // 已移除，避免报错
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

// --- 🖱️ 鼠标状态 Hook ---
function useCursorState() {
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)
  return { hovered, setHovered }
}

// --- 📱 UI 覆盖层 ---
function Overlay({ isDispersed, toggle, hasActivePhoto }: { isDispersed: boolean, toggle: () => void, hasActivePhoto: boolean }) {
  return (
    <div style={{
      position: 'absolute',
      bottom: 0, left: 0, right: 0,
      padding: '40px',
      display: 'flex',
      justifyContent: 'flex-end',
      pointerEvents: 'none'
    }}>
      {!hasActivePhoto && (
        <button
          onClick={toggle}
          style={{
            pointerEvents: 'auto',
            background: isDispersed ? 'rgba(255, 50, 50, 0.8)' : 'rgba(10, 150, 50, 0.8)',
            color: 'white',
            border: '2px solid rgba(255,255,255,0.5)',
            padding: '12px 30px',
            fontSize: '18px',
            fontWeight: 'bold',
            borderRadius: '50px',
            cursor: 'pointer',
            backdropFilter: 'blur(4px)',
            transition: 'all 0.3s ease',
            boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          {isDispersed ? "Close Gallery" : "Open Tree 🎄"}
        </button>
      )}
      
      <div style={{
        position: 'absolute',
        top: '20px', left: '50%', transform: 'translateX(-50%)',
        color: 'rgba(255,255,255,0.6)',
        fontSize: '14px',
        opacity: isDispersed && !hasActivePhoto ? 1 : 0,
        transition: 'opacity 0.5s'
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

  // 生成照片列表：取余数逻辑，让 31 张图循环填充 CONFIG.counts.ornaments (80张)
  const photos = useMemo(() => 
    Array.from({ length: CONFIG.counts.ornaments }, (_, i) => {
      // 假设文件夹里有 1.jpg 到 31.jpg
      const fileIndex = (i % 11) + 1 
      return `/photos/${fileIndex}.jpg`
    }), 
  [])

  const handleToggle = () => {
    setIsDispersed(prev => !prev)
    setActivePhotoId(null)
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#020205', overflow: 'hidden' }}>
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 0, 35], fov: 35 }}>
        <color attach="background" args={['#020205']} />
        
        {/* 灯光系统 */}
        <ambientLight intensity={0.4} />
        <pointLight position={[10, 20, 10]} intensity={1.5} color="#ffddaa" />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#blue" />
        <fog attach="fog" args={['#020205', 20, 70]} />

        {/* 核心内容 */}
        <TreeParticles 
          isDispersed={isDispersed} 
          onClickTree={() => setIsDispersed(true)} 
        />
        
        {/* 3D 几何装饰 (红球/黄方块) */}
        <GeometricOrnaments isDispersed={isDispersed} />

        {/* 循环复用的照片墙 */}
        {photos.map((url, i) => (
          <InteractablePhoto 
            key={i} 
            index={i} 
            url={url} 
            isDispersed={isDispersed}
            activeId={activePhotoId}
            setActiveId={setActivePhotoId}
          />
        ))}

        <TitleText visible={!isDispersed} />

        <OrbitControls 
          enablePan={false}
          enableZoom={true}
          minDistance={10}
          maxDistance={60}
          autoRotate={!activePhotoId}
          autoRotateSpeed={isDispersed ? 0.3 : 1.5}
          enabled={!activePhotoId}
        />

        {/* 后期处理 */}
        <EffectComposer enableNormalPass={false}>
          <Bloom luminanceThreshold={0.2} mipmapBlur intensity={1.5} radius={0.5} />
          <Vignette eskil={false} offset={0.1} darkness={1.1} />
        </EffectComposer>
      </Canvas>

      <Overlay 
        isDispersed={isDispersed} 
        toggle={handleToggle} 
        hasActivePhoto={activePhotoId !== null}
      />
    </div>
  )
}