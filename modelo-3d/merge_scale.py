# Junta a capa frontal (KETI-TOP) + corpo (KETI-ZHONG) num STL unico a 50%
import Mesh
import FreeCAD as App

BASE = "/Users/patrickfernandespais/Desktop/Goodwe/modelo-3d/capa-extraida"
OUT = "/Users/patrickfernandespais/Desktop/Goodwe/modelo-3d/capa-replica-50pct.stl"

m = Mesh.Mesh()
for name in ["KETI-ZHONG.stl", "KETI-TOP.stl"]:
    part = Mesh.Mesh(BASE + "/" + name)
    m.addMesh(part)

# escala 50%
mat = App.Matrix()
mat.scale(0.5, 0.5, 0.5)
m.transform(mat)

m.write(OUT)
bb = m.BoundBox
print("OK: %s" % OUT)
print("dimensoes finais: %.1f x %.1f x %.1f mm, %d triangulos" % (bb.XLength, bb.YLength, bb.ZLength, m.CountFacets))
