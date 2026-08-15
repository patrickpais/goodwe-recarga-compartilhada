# Extrai as pecas da carcaca (KETI*) do STEP oficial da GoodWe e exporta como STL
import sys, os, traceback

OUT_DIR = "/Users/patrickfernandespais/Desktop/Goodwe/modelo-3d/capa-extraida"
STEP = "/Users/patrickfernandespais/Desktop/Goodwe/modelo-3d/00-7kW-3D.stp"
LOG = os.path.join(OUT_DIR, "extract_log.txt")

os.makedirs(OUT_DIR, exist_ok=True)

def log(msg):
    with open(LOG, "a") as f:
        f.write(msg + "\n")
    print(msg, flush=True)

try:
    import FreeCAD as App
    import Part
    import Import
    import MeshPart
    import Mesh

    log("Abrindo STEP (isso demora, arquivo de 110MB)...")
    doc = App.newDocument("goodwe")
    Import.insert(STEP, "goodwe")
    log("STEP carregado. Objetos no documento: %d" % len(doc.Objects))

    # inventario completo
    with open(os.path.join(OUT_DIR, "inventario.txt"), "w") as inv:
        for o in doc.Objects:
            has_shape = hasattr(o, "Shape") and o.Shape is not None and not o.Shape.isNull()
            faces = len(o.Shape.Faces) if has_shape else 0
            inv.write("%s | %s | %s | faces=%d\n" % (o.Name, o.Label, o.TypeId, faces))

    # alvos: pecas cujo Label contem KETI (carcaca)
    targets = [o for o in doc.Objects if "KETI" in o.Label.upper()]
    log("Objetos KETI encontrados: %d" % len(targets))
    for t in targets:
        log("  - %s (%s) tipo=%s" % (t.Label, t.Name, t.TypeId))

    exported = 0
    for t in targets:
        try:
            shape = Part.getShape(t)
            if shape is None or shape.isNull() or len(shape.Faces) == 0:
                log("PULANDO %s: sem geometria propria (provavelmente so um container)" % t.Label)
                continue
            safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in t.Label)
            out = os.path.join(OUT_DIR, safe + ".stl")
            mesh = MeshPart.meshFromShape(Shape=shape, LinearDeflection=0.35, AngularDeflection=0.6, Relative=False)
            m = Mesh.Mesh()
            m.addMesh(mesh)
            m.write(out)
            log("EXPORTADO: %s (%d faces CAD -> %d triangulos) -> %s" % (t.Label, len(shape.Faces), mesh.CountFacets, out))
            exported += 1
        except Exception as e:
            log("ERRO exportando %s: %s" % (t.Label, e))

    log("FIM. %d arquivos exportados em %s" % (exported, OUT_DIR))
except Exception:
    log("ERRO FATAL:\n" + traceback.format_exc())
    sys.exit(1)
