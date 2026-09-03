import type { Criticidad, ItemCatalogo } from "../types";

/**
 * CATALOGO GENERAL - 94 items agrupados en 17 zonas/sistemas del equipo de torre.
 *
 * Consolidado de lo que observan las inspectoras externas (OIL DASSA) para las operadoras.
 * Es generico: sirve para cualquier equipo de torre de la flota, no para uno en particular.
 *
 *  - `item`           condicion esperada a verificar, redactada en positivo.
 *  - `hallazgoTipico` como se redacta el hallazgo cuando el item falla. Se le muestra al
 *                     inspector detras del boton "?" para que sepa que mirar.
 *  - `criticidadRef`  criticidad con la que las inspectoras suelen clasificar ese hallazgo.
 *
 * Los items promovidos por el usuario NO van aca: se guardan en storage (`catalogoExtra`)
 * con ids desde 1000 y se fusionan en runtime con `catalogoCompleto()`.
 */
export const CATALOGO: ItemCatalogo[] = [
  {
    id: 1,
    zona: "Acceso/Escaleras",
    criticidadRef: "MAYOR",
    item: "Escalones de escalera de primer tramo de mástil íntegros, sin daños ni ingreso de humedad",
    hallazgoTipico:
      "Escalon superior de escalera de primer tramo de mastil dañado a pesar de reparaciones; permite ingreso de humedad",
  },
  {
    id: 2,
    zona: "Acceso/Escaleras",
    criticidadRef: "MAYOR",
    item: "Acceso a regulación de riendas con cierre perimetral de altura ≥ 1,10 m (YPF) y escalones de profundidad adecuada",
    hallazgoTipico:
      "Acceso a regulacion de riendas: cierre perimetral con alto que no cumple YPF (min 1,10m); escalones de profundidad inadecuada",
  },
  {
    id: 3,
    zona: "Acceso/Escaleras",
    criticidadRef: "MAYOR",
    item: "Escalera de acceso a válvula de seguridad de bomba de ahogue completa (con escalón inferior)",
    hallazgoTipico: "Escalera de acceso a valvula de seguridad de bomba de ahogue sin escalon inferior",
  },
  {
    id: 4,
    zona: "Acceso/Escaleras",
    criticidadRef: "MAYOR",
    item: "Escalera de acceso a Trip-tank: grillete superior de línea de vida con seguro y eslinga de seguridad presente",
    hallazgoTipico:
      "Escalera de acceso a Trip-tank: grillete superior de linea de vida sin seguro; falta eslinga de seguridad",
  },
  {
    id: 5,
    zona: "Acceso/Escaleras",
    criticidadRef: "MAYOR",
    item: "Sector de acceso a regulación de riendas libre de mangueras u obstáculos (sin riesgo de tropiezo)",
    hallazgoTipico:
      "Manguera hidraulica obstruye libre paso en sector de acceso a regulacion de riendas (riesgo tropiezo)",
  },
  {
    id: 6,
    zona: "Acceso/Escaleras",
    criticidadRef: "MENOR",
    item: "Escalera posterior del segundo tramo de mástil sin escalones deformados (zona de vinculación inferior de línea de vida)",
    hallazgoTipico:
      "Escalera posterior del segundo tramo de mastil con escalon inferior deformado por impacto (zona de vinculacion inferior linea de vida)",
  },
  {
    id: 7,
    zona: "Acumulador hidraulico",
    criticidadRef: "MAYOR",
    item: "Sistema acumulador sin pérdidas de aceite hidráulico en conexiones de mangueras ni en vástago de bomba neumática",
    hallazgoTipico:
      "Perdida de aceite hidraulico en conexiones de mangueras del sistema acumulador (sector aledaño al carretel de arrollamiento)",
  },
  {
    id: 8,
    zona: "Acumulador hidraulico",
    criticidadRef: "MENOR",
    item: "Presostato de bomba neumática del acumulador regulado (arranque automático según especificación, ref. 2900 psi)",
    hallazgoTipico:
      "Falta regular presostato de bomba neumatica de acumulador hidraulico (arranque automatico 2900psi)",
  },
  {
    id: 9,
    zona: "Almacenamiento",
    criticidadRef: "MAYOR",
    item: "Bidones de combustible/químicos en depósito de herramientas sobre bandeja de contención ecológica",
    hallazgoTipico:
      "Almacenamiento de 3 bidones en deposito de herramientas (2 con combustible) sin bandeja de contencion ecologica",
  },
  {
    id: 10,
    zona: "BOP",
    criticidadRef: "MAYOR",
    item: "Mangueras hidráulicas de BOP con protección mecánica íntegra",
    hallazgoTipico: "Manguera hidraulica de BOP con proteccion mecanica dañada",
  },
  {
    id: 11,
    zona: "BOP",
    criticidadRef: "MAYOR",
    item: "Volantes para cierre manual de BOP instalados",
    hallazgoTipico: "No se encuentran instalados volantes para cierre manual de BOP",
  },
  {
    id: 12,
    zona: "BOP",
    criticidadRef: "MAYOR",
    item: "Mangueras hidráulicas de BOP con eslingas de seguridad",
    hallazgoTipico: "Mangueras hidraulicas de BOP sin eslingas de seguridad",
  },
  {
    id: 13,
    zona: "Bomba de ahogue/AP",
    criticidadRef: "MAYOR",
    item: "Acelerador de bomba de ahogue con retorno automático a cero (requisito YPF)",
    hallazgoTipico:
      "Acelerador de bomba de ahogue sin retorno automatico a cero (modificaciones realizadas no cumplen YPF)",
  },
  {
    id: 14,
    zona: "Bomba de ahogue/AP",
    criticidadRef: "MAYOR",
    item: "Uniones a golpe de líneas AP de bomba de ahogue y línea de venteo del golpeador con alas sin desgaste",
    hallazgoTipico:
      "Uniones dobles a golpe de linea AP de bomba de ahogue y linea de venteo del golpeador con alas desgastadas",
  },
  {
    id: 15,
    zona: "Bomba de ahogue/AP",
    criticidadRef: "MAYOR",
    item: "Fajas de seguridad (TPR) en líneas AP correctamente colocadas, en buen estado y con etiquetas de identificación legibles",
    hallazgoTipico:
      "Fajas de seguridad (TPR) en lineas AP de bomba de ahogue mal colocadas, deterioradas y sin etiquetas de identificacion",
  },
  {
    id: 16,
    zona: "Bomba de ahogue/AP",
    criticidadRef: "MAYOR",
    item: "Manguerotes 2in de líneas AP y Trip-Tank con cubiertas exteriores íntegras",
    hallazgoTipico: "Multiples manguerotes 2in de lineas AP y Trip-Tank con cubiertas exteriores dañadas",
  },
  {
    id: 17,
    zona: "Bomba de ahogue/AP",
    criticidadRef: "MAYOR",
    item: "Manguerote 2in vinculado a standpipe con eslinga de seguridad",
    hallazgoTipico: "Manguerote 2in vinculado a standpipe sin eslinga de seguridad",
  },
  {
    id: 18,
    zona: "Bomba de ahogue/AP",
    criticidadRef: "MAYOR",
    item: "Manómetro de bomba de ahogue con cartilla de lectura legible",
    hallazgoTipico: "Manometro de bomba de ahogue con cartilla de lectura con escasa visibilidad",
  },
  {
    id: 19,
    zona: "Bomba de ahogue/AP",
    criticidadRef: "MAYOR",
    item: "Empaquetadura del pistón y camisas de bomba de ahogue en buen estado",
    hallazgoTipico: "Empaquetadura del piston y superficie interna de camisa de bomba de ahogue deterioradas",
  },
  {
    id: 20,
    zona: "Chasis",
    criticidadRef: "CRITICA",
    item: "Trabajos de soldadura en chasis (vigas, zona de gatos) con documentación de inspección/ensayo disponible",
    hallazgoTipico:
      "Viga trasera de chasis con trabajos de soldaduras (aledaños a gatos traseros) sin documentacion de inspeccion",
  },
  {
    id: 21,
    zona: "Chasis",
    criticidadRef: "MAYOR",
    item: "Cordones de soldadura de chasis sin fisuras (verificar sector inferior delantero lado maquinista)",
    hallazgoTipico:
      "Fisura en cordon de soldadura, sector inferior chasis zona delantera lado maquinista (CRITICO PARA TRANSPORTE)",
  },
  {
    id: 22,
    zona: "Documentacion",
    criticidadRef: "CRITICA",
    item: "Certificado de calibración/ensayo de guinche hidráulico vigente",
    hallazgoTipico: "Certificado de calibracion de guinche hidraulico vencido",
  },
  {
    id: 23,
    zona: "Documentacion",
    criticidadRef: "MENOR",
    item: "Cartelería de capacidad del guinche hidráulico coincidente con la capacidad certificada",
    hallazgoTipico:
      "Guinche hidraulico con carteleria pintada con capacidades no estipuladas (2.5 Tn en lugar de 1.5 Tn)",
  },
  {
    id: 24,
    zona: "Documentacion",
    criticidadRef: "MENOR",
    item: "Trip-tank con cartelería legible y códigos de colores correctos en partes móviles, líneas eléctricas e hidráulicas",
    hallazgoTipico:
      "Trip-tank con carteleria poco legible; codigos de colores inapropiados en partes moviles, lineas electricas e hidraulicas",
  },
  {
    id: 25,
    zona: "Elevadores",
    criticidadRef: "CRITICA",
    item: "Elevador a cuñas con todos los bulones ajustados",
    hallazgoTipico: "Elevador a cuñas en uso con tres (3) bulones sin ajuste",
  },
  {
    id: 26,
    zona: "Elevadores",
    criticidadRef: "MAYOR",
    item: "Elevador a cuñas: bulones de fijación de lengüeta tope de tubing con mallado de seguridad",
    hallazgoTipico: "Elevador cuña con lengueta para tope de tubing con bulones de fijacion sin mallado de seguridad",
  },
  {
    id: 27,
    zona: "Elevadores",
    criticidadRef: "MAYOR",
    item: "Elevadores de varillas de bombeo con seguro en pernos de asas",
    hallazgoTipico: "Tres (3) elevadores de varillas de bombeo sin seguro en pernos de asas",
  },
  {
    id: 28,
    zona: "Iluminacion/Electrico",
    criticidadRef: "MAYOR",
    item: "Luz de emergencia en cabina de maquinista operativa",
    hallazgoTipico:
      "Luz de emergencia en cabina de maquinista no funciona; falta luz de emergencia en comandos de pistoneo y bomba ahogue",
  },
  {
    id: 29,
    zona: "Iluminacion/Electrico",
    criticidadRef: "MAYOR",
    item: "Luz de emergencia disponible y operativa en comandos de pistoneo, bomba de ahogue y acumulador hidráulico",
    hallazgoTipico: "No se dispone de luz de emergencia en comandos de pistoneo",
  },
  {
    id: 30,
    zona: "Iluminacion/Electrico",
    criticidadRef: "MAYOR",
    item: "Plafones de iluminación de mástil con vinculaciones íntegras",
    hallazgoTipico: "Plafon de iluminacion de mastil (aledaño a corona) con vinculacion inferior dañada",
  },
  {
    id: 31,
    zona: "Iluminacion/Electrico",
    criticidadRef: "MENOR",
    item: "Protectores de plafones de iluminación de mástil sin deformaciones",
    hallazgoTipico: "Protector de plafon de iluminacion de mastil deformado por impacto",
  },
  {
    id: 32,
    zona: "Iluminacion/Electrico",
    criticidadRef: "MENOR",
    item: "Instalación eléctrica del mástil (mangueras y cables) anclada, sin excedentes sueltos cerca del piso de enganche",
    hallazgoTipico:
      "Instalacion electrica del mastil (mangueras y cables) cerca de piso de enganche con longitud excesiva sin anclar (riesgos de enganche)",
  },
  {
    id: 33,
    zona: "Linea de vida",
    criticidadRef: "MAYOR",
    item: "Línea de vida de escalera de acceso a mástil: punto de vinculación superior por encima del piso de enganche, con eslinga de seguridad y cálculo de resistencia",
    hallazgoTipico:
      "Linea de vida de escalera de acceso a mastil: punto de vinculacion superior debajo del nivel de piso de enganche; sin eslinga seguridad ni calculo de resistencia",
  },
  {
    id: 34,
    zona: "Linea de vida",
    criticidadRef: "MAYOR",
    item: "Acceso a mástil por parte superior de cabina estable, con cierre perimetral y CR-Cable a altura adecuada",
    hallazgoTipico:
      "Acceso a mastil por parte superior de cabina con inestabilidad; falta cierre perimetral; CR-Cable a altura inadecuada",
  },
  {
    id: 35,
    zona: "Linea de vida",
    criticidadRef: "MAYOR",
    item: "Escalera de segundo tramo de mástil con línea de vida para acceso a corona",
    hallazgoTipico: "Escalera de segundo tramo de mastil sin linea de vida para acceso a corona",
  },
  {
    id: 36,
    zona: "Linea de vida",
    criticidadRef: "MAYOR",
    item: "Línea de vida de escalera de segundo tramo tensada y con 3 dispositivos CR-Cable (normativa)",
    hallazgoTipico:
      "Linea de vida en escalera de segundo tramo para acceso a corona: falta de tension; solo 1 dispositivo CR-Cable (normativa exige 3)",
  },
  {
    id: 37,
    zona: "Linea de vida",
    criticidadRef: "MAYOR",
    item: "Soporte superior de anclaje T5 en corona sin interferencias con cable de guinche ni línea viva; perno de anclaje sin filetes al corte; eslingas de seguridad en T5 y en líneas de vida lateral y posterior",
    hallazgoTipico:
      "Soporte superior anclaje T5 en corona genera interferencias con cable guinche y cable linea viva de aparejo; perno con filetes de rosca al corte; ausencia de eslingas de seguridad en T5 y lineas vida lateral y posterior",
  },
  {
    id: 38,
    zona: "Linea de vida",
    criticidadRef: "MENOR",
    item: "Punto de vinculación inferior de línea de vida de escalera de acceso a mástil con todas sus grampas",
    hallazgoTipico:
      "Punto de vinculacion inferior de linea de vida de escalera de acceso a mastil con grampa faltante",
  },
  {
    id: 39,
    zona: "Llave de tubing",
    criticidadRef: "CRITICA",
    item: "Interbloqueo de tapa protectora de llave hidráulica de tubing operativo (comandos inhabilitados con tapa abierta)",
    hallazgoTipico:
      "Llave hidraulica de tubing en operacion con falta de regulacion en tapa protectora: comandos funcionales con tapa abierta (interbloqueo violado)",
  },
  {
    id: 40,
    zona: "Llave de tubing",
    criticidadRef: "MAYOR",
    item: "Mangueras hidráulicas de llave de tubing con cubiertas íntegras y eslinga de seguridad; manguera neumática de contra-llave sin pérdidas",
    hallazgoTipico:
      "Mangueras hidraulicas de llave de tubing con cubiertas dañadas; manguera neumatica de contra-llave con perdidas",
  },
  {
    id: 41,
    zona: "Llave de tubing",
    criticidadRef: "MAYOR",
    item: "Cuña neumática con mangueras en buen estado",
    hallazgoTipico: "Cuña neumatica con mangueras dañadas",
  },
  {
    id: 42,
    zona: "Mastil",
    criticidadRef: "MAYOR",
    item: "Pistón de segundo tramo de mástil sin pérdidas de aceite",
    hallazgoTipico: "Piston de segundo tramo de mastil con perdidas de aceite",
  },
  {
    id: 43,
    zona: "Mastil",
    criticidadRef: "MAYOR",
    item: "Cable de regulación del piso de enganche sin contacto ni interferencia con perfilería del mástil ni plafones",
    hallazgoTipico:
      "Cable de regulacion del piso de enganche con puntos de contacto fisico (interferencias) con perfileria estructural del mastil y plafon de iluminacion",
  },
  {
    id: 44,
    zona: "Mastil",
    criticidadRef: "MAYOR",
    item: "Elementos en altura con eslinga de seguridad anticaída efectiva (protector conectores pistón 1er tramo, pestillos trabas 2do tramo, cámaras de seguridad, mangueras cabeza rotativa, T5, línea de vida escalera lateral, puerta de escape, poleas de regulación y de guinche en corona)",
    hallazgoTipico:
      "Multiples elementos sin eslinga de seguridad anticaidas o inefectivas: protector conectores piston 1er tramo, pestillo trabas 2do tramo, camaras seguridad, mangueras cabeza rotativa, T5 20m, linea vida escalera lateral, puerta escape",
  },
  {
    id: 45,
    zona: "Mastil",
    criticidadRef: "MAYOR",
    item: "Riendas de carga de primer y segundo tramo de mástil con doble ojal certificado (sin vinculaciones grampadas)",
    hallazgoTipico:
      "Riendas de cargas de primer y segundo tramo de mastil sin doble ojal certificado (vinculaciones inferiores grampadas)",
  },
  {
    id: 46,
    zona: "Mastil",
    criticidadRef: "MAYOR",
    item: "Centralizadores de pistón de segundo tramo correctamente regulados; pistón sin marcas superficiales",
    hallazgoTipico:
      "Centralizadores de piston de segundo tramo con regulacion inadecuada; marcas superficiales sobre piston",
  },
  {
    id: 47,
    zona: "Mastil",
    criticidadRef: "MAYOR",
    item: "Material de sacrificio en sector posterior de mástil efectivo (sin rozamiento directo del cable) y con eslinga de seguridad",
    hallazgoTipico:
      "Material de sacrificio en sector posterior de mastil ineficiente: rozamiento directo del cable; sin eslinga de seguridad",
  },
  {
    id: 48,
    zona: "Mastil",
    criticidadRef: "MAYOR",
    item: "Bulones de standpipe y abrazaderas de cámaras de seguridad con tuercas aptas para altura (no hexagonales comunes)",
    hallazgoTipico:
      "Bulon de standpipe con tuerca hexagonal comun; abrazaderas en camaras de seguridad con tuercas no recomendadas para altura",
  },
  {
    id: 49,
    zona: "Mastil",
    criticidadRef: "MAYOR",
    item: "Accesorios de mástil y piso de enganche vinculados con cadenas certificadas, sin eslabones soldados",
    hallazgoTipico:
      "Multiples accesorios en mastil y piso de enganche vinculados mediante cadenas con eslabones soldados (compromete capacidad certificada)",
  },
  {
    id: 50,
    zona: "Mastil",
    criticidadRef: "MAYOR",
    item: "Gomas antichoque en perfilería de mástil y piso de enganche íntegras y adheridas",
    hallazgoTipico:
      "Gomas pegadas a perfileria de mastil y piso de enganche para evitar contacto metal-metal dañadas/despegadas",
  },
  {
    id: 51,
    zona: "Mastil",
    criticidadRef: "MAYOR",
    item: "Eslinga de seguridad de pistón de primer tramo sin hilos cortados",
    hallazgoTipico:
      "Eslinga de seguridad de piston de primer tramo con multiples hilos cortados en condicion de descarte",
  },
  {
    id: 52,
    zona: "Mastil",
    criticidadRef: "MAYOR",
    item: "Pisadera rebatible entre tambor principal y pistón de primer tramo sin deformaciones",
    hallazgoTipico: "Pisadera rebatible entre tambor principal y piston del primer tramo deformada",
  },
  {
    id: 53,
    zona: "Mastil",
    criticidadRef: "MAYOR",
    item: "Protección de conectores hidráulicos de pistón de primer tramo anclada a estructura fija (no a los propios conectores)",
    hallazgoTipico:
      "Proteccion robusta de conectores hidraulicos de piston de primer tramo instalada de manera ineficiente (vinculada a los conectores en lugar de a estructura fija)",
  },
  {
    id: 54,
    zona: "Mastil",
    criticidadRef: "MAYOR",
    item: "Bulonería de accesorios de mástil con sistema de bloqueo efectivo (arandelas NORD-LOCK bien instaladas o tuercas autofrenantes)",
    hallazgoTipico:
      "Multiples accesorios del mastil con arandelas de seguridad NORD-LOCK incorrectamente; tuercas hexagonales comunes con riesgo de desajuste por vibracion",
  },
  {
    id: 55,
    zona: "Mastil",
    criticidadRef: "MAYOR",
    item: "Amortiguador de corona con eslinga de seguridad",
    hallazgoTipico: "Amortiguador de corona sin eslinga de seguridad",
  },
  {
    id: 56,
    zona: "Mastil",
    criticidadRef: "MAYOR",
    item: "Punto muerto de cable de regulación de piso de enganche con grapado correcto (guardacabo en posición, separación de grapas adecuada)",
    hallazgoTipico:
      "Punto muerto de cable de regulacion de piso de enganche con grapado inadecuado: guardacabo desplazado y separacion excesiva de grapas",
  },
  {
    id: 57,
    zona: "Mastil",
    criticidadRef: "MENOR",
    item: "Grillete de anclaje inferior de regulación de piso de enganche sin deformación ni interferencia con perfil secundario del mástil",
    hallazgoTipico:
      "Recambio reciente de grillete (anclaje inferior regulacion piso enganche, lado opuesto maquinista) presenta interferencia fisica permanente con perfil secundario del mastil (contacto metal-metal)",
  },
  {
    id: 58,
    zona: "Mastil",
    criticidadRef: "MENOR",
    item: "Gancho de desmontaje aledaño a tope de mástil sin deformaciones",
    hallazgoTipico: "Gancho aledaño a tope de mastil para desmontaje deformado",
  },
  {
    id: 59,
    zona: "Mastil",
    criticidadRef: "MENOR",
    item: "Cables de sensores del mástil íntegros",
    hallazgoTipico: "Cable de sensor en mastil cortado (sector posterior, aledaño a piso de enganche)",
  },
  {
    id: 60,
    zona: "Mastil",
    criticidadRef: "MENOR",
    item: "Cable de guinche hidráulico sin rozamiento con mangueras eléctricas; placa de punto muerto de eslinga de plafón vinculada",
    hallazgoTipico:
      "Cable de guinche hidraulico con rozamiento leve con manguera electrica del plafon de iluminacion (aledaño a corona); placa metalica de punto muerto sin vincular",
  },
  {
    id: 61,
    zona: "Mastil",
    criticidadRef: "GENERAL",
    item: "Riendas de carga de mástil sin hilos cortados (registrar y dar seguimiento aunque no alcance criterio de descarte)",
    hallazgoTipico:
      "Rienda de carga de mastil (lado maquinista) con 1 hilo cortado en sector superior cercano a corona (no cumple criterio de descarte; recomienda seguimiento)",
  },
  {
    id: 62,
    zona: "Otros",
    criticidadRef: "CRITICA",
    item: "Sistema espumígeno de pileta operativo (tiempo de respuesta y cobertura adecuados)",
    hallazgoTipico: "Espumigeno de pileta no opera adecuadamente: tiempo excesivo de funcionamiento y escasa cobertura",
  },
  {
    id: 63,
    zona: "Otros",
    criticidadRef: "MAYOR",
    item: "Sector inferior del equipo sin pérdidas de aceite",
    hallazgoTipico: "Multiples perdidas de aceite en sector inferior de equipo",
  },
  {
    id: 64,
    zona: "Otros",
    criticidadRef: "MAYOR",
    item: "Manguera hidráulica 1in de retorno a tanque sin pérdidas",
    hallazgoTipico: "Manguera hidraulica 1in de retorno a tanque con perdidas de aceite",
  },
  {
    id: 65,
    zona: "Otros",
    criticidadRef: "MENOR",
    item: "Carretel de reserva de cable de aparejo con cobertor",
    hallazgoTipico: "Carretel de reserva de cable de aparejo sin cobertor",
  },
  {
    id: 66,
    zona: "Otros",
    criticidadRef: "MENOR",
    item: "Matafuego de 50 kg con manguera en buen estado",
    hallazgoTipico: "Mata fuego de 50kg con manguera dañada",
  },
  {
    id: 67,
    zona: "Otros",
    criticidadRef: "MENOR",
    item: "Carretel de reserva de cable de aparejo con traba de giro",
    hallazgoTipico: "Carretel de reserva de cable de aparejo sin traba de giro",
  },
  {
    id: 68,
    zona: "Otros",
    criticidadRef: "MENOR",
    item: "Matafuegos con seguro/precinto contra accionamiento involuntario",
    hallazgoTipico: "Dos matafuegos de 10 kg cada uno (cargados) sin seguro para evitar accionamientos involuntarios",
  },
  {
    id: 69,
    zona: "Otros",
    criticidadRef: "GENERAL",
    item: "Devanador para cable de pistoneo disponible (requisito contractual)",
    hallazgoTipico: "No posee devanador para cable de pistoneo (Contractual)",
  },
  {
    id: 70,
    zona: "Otros",
    criticidadRef: "GENERAL",
    item: "Cable de aparejo sin hilos cortados (registrar y dar seguimiento si están fuera del área activa)",
    hallazgoTipico:
      "Multiples hilos cortados en cable de aparejo (fuera del area activa, sin no conformidad; recomienda seguimiento)",
  },
  {
    id: 71,
    zona: "Pirosalva/Anticaidas",
    criticidadRef: "CRITICA",
    item: "Componente textil (cinta) del dispositivo inercial CARANBLOCK sin deterioro",
    hallazgoTipico:
      "Sistema inercial CARANBLOCK: componente textil (cinta de seguridad) con signos evidentes de deterioro fisico",
  },
  {
    id: 72,
    zona: "Pirosalva/Anticaidas",
    criticidadRef: "CRITICA",
    item: "Sistema pirosalva correctamente instalado: cable del deslizador regulado, sin interferencia con puerta de escape; puerta y gancho libres (sin trabas improvisadas)",
    hallazgoTipico:
      "Instalacion del sistema de pirosalva inadecuada: cable del deslizador sin regulacion provoca interferencias con apertura de puerta de escape; puerta y gancho bloqueados con trapos",
  },
  {
    id: 73,
    zona: "Pirosalva/Anticaidas",
    criticidadRef: "CRITICA",
    item: "Sistema superior del pirosalva: textil del gancho del deslizador en buen estado, sin elementos ajenos al fabricante; vinculación al deslizador con bulonería con seguro",
    hallazgoTipico:
      "Sistema superior pirosalva: textil del gancho del deslizador en mal estado; elementos ajenos al fabricante; vinculacion al deslizador con bulon y tuerca hexagonal comun sin seguro",
  },
  {
    id: 74,
    zona: "Pirosalva/Anticaidas",
    criticidadRef: "MAYOR",
    item: "Dispositivos inerciales anticaídas (T5) no activados; si están activados, con reporte de incidente asociado",
    hallazgoTipico: "Dispositivo inercial anticaidas (T5) activado sin reporte de incidente asociado",
  },
  {
    id: 75,
    zona: "Pirosalva/Anticaidas",
    criticidadRef: "MAYOR",
    item: "Triángulo de pirosalva y caranblock en puntos de anclaje independientes o con eslinga de seguridad",
    hallazgoTipico: "Triangulo de pirosalva y caranblock vinculados al mismo punto de anclaje, sin eslinga de seguridad",
  },
  {
    id: 76,
    zona: "Pirosalva/Anticaidas",
    criticidadRef: "MAYOR",
    item: "Dispositivo inercial anticaídas de piso de enganche de longitud adecuada (sin caída libre excesiva)",
    hallazgoTipico:
      "Dispositivo inercial anticaidas de piso de enganche de longitud excesiva: permite caida libre mayor a la admisible",
  },
  {
    id: 77,
    zona: "Pirosalva/Anticaidas",
    criticidadRef: "GENERAL",
    item: "Bulón del punto de anclaje para arnés en deslizador de pirosalva de tipo recomendado (rosca no trabajando al corte)",
    hallazgoTipico:
      "Bulon del punto de anclaje para arnes en deslizador de pirosalva de tipo no recomendado: rosca trabajando al corte",
  },
  {
    id: 78,
    zona: "Piso de enganche",
    criticidadRef: "CRITICA",
    item: "Piso de enganche libre de elementos sueltos o atados de forma improvisada (botellas, trapos, etc.)",
    hallazgoTipico:
      "Elementos sueltos y atados de forma improvisada en piso de enganche (botellas, trapos): riesgo de caida de objetos",
  },
  {
    id: 79,
    zona: "Piso de enganche",
    criticidadRef: "MAYOR",
    item: "Poleas guía del cable de regulación de piso de enganche sin desgaste, con bolsillos de retención; cable encarrilado",
    hallazgoTipico:
      "Poleas guia del cable de regulacion de piso de enganche con desgaste y sin bolsillos de retencion; cable desencarrilado",
  },
  {
    id: 80,
    zona: "Piso de enganche",
    criticidadRef: "MAYOR",
    item: "Riendas de seguridad de piso de enganche sin deformaciones permanentes",
    hallazgoTipico: "Riendas de seguridad de piso de enganche con deformaciones permanentes",
  },
  {
    id: 81,
    zona: "Piso de enganche",
    criticidadRef: "MAYOR",
    item: "Peines de piso de enganche alineados",
    hallazgoTipico: "Peines de piso de enganche desalineados",
  },
  {
    id: 82,
    zona: "Piso de enganche",
    criticidadRef: "MAYOR",
    item: "Cables de seguridad en piso de enganche con cantidad de grampas suficiente",
    hallazgoTipico: "Cables de seguridad en piso de enganche con cantidad de grampas insuficiente",
  },
  {
    id: 83,
    zona: "Piso de enganche",
    criticidadRef: "MAYOR",
    item: "Cable de regulación de piso de enganche con dirección de trabajo correcta, sin rozamiento con soporte de poleas",
    hallazgoTipico:
      "Cable de regulacion de piso de enganche con direccion de trabajo incorrecta: rozamiento con soporte de poleas",
  },
  {
    id: 84,
    zona: "Piso de enganche",
    criticidadRef: "MAYOR",
    item: "Eslinga de seguridad de pisadera rebatible sin hilos cortados",
    hallazgoTipico: "Eslinga de seguridad de pisadera rebatible con hilos cortados",
  },
  {
    id: 85,
    zona: "Piso de enganche",
    criticidadRef: "MENOR",
    item: "Perfilería de piso de enganche sin marcas de rozamiento con cable de guinche",
    hallazgoTipico: "Perfileria de piso de enganche con marcas de rozamiento producidas por el cable de guinche",
  },
  {
    id: 86,
    zona: "Piso de enganche",
    criticidadRef: "MENOR",
    item: "Piso de enganche sin elementos personales colgados de cadenas o accesorios (lentes, etc.)",
    hallazgoTipico: "Elementos personales (lentes) colgados de cadenas y accesorios del piso de enganche",
  },
  {
    id: 87,
    zona: "Piso de enganche",
    criticidadRef: "MENOR",
    item: "Cable de seguridad de pisadera rebatible con grampas correctamente colocadas",
    hallazgoTipico: "Cable de seguridad de pisadera rebatible con grampas mal colocadas",
  },
  {
    id: 88,
    zona: "Piso de enganche",
    criticidadRef: "MENOR",
    item: "Pisadera lateral del piso de trabajo en ingreso por escalera de acceso alineada",
    hallazgoTipico: "Pisadera lateral del piso de trabajo desalineada en el ingreso por escalera de acceso",
  },
  {
    id: 89,
    zona: "Sistema operativo",
    criticidadRef: "MAYOR",
    item: "Prueba de inercia positiva; selectora con cambios mayores a 3ra anulados",
    hallazgoTipico: "Prueba de inercia negativa; selectora permite cambios mayores a 3ra sin anular",
  },
  {
    id: 90,
    zona: "Piso de trabajo",
    criticidadRef: "MAYOR",
    item: "Piso de trabajo con antideslizante tipo safety pad en óptimas condiciones",
    hallazgoTipico: "Antideslizante tipo safety pad del piso de trabajo deteriorado",
  },
  {
    id: 91,
    zona: "Documentacion",
    criticidadRef: "CRITICA",
    item: "Registro de inspección DROPS de poleas y pernos de izaje con certificación vigente; inventario DROPS actualizado",
    hallazgoTipico:
      "Sin registro de inspeccion DROPS de poleas y pernos de izaje vigente; inventario DROPS desactualizado",
  },
  {
    id: 92,
    zona: "Otros",
    criticidadRef: "MAYOR",
    item: "Fuelles de bisagras y amortiguador de cierre de puerta en buen estado; protección de manos en zona de bisagra",
    hallazgoTipico:
      "Fuelles de bisagras y amortiguador de cierre de puerta deteriorados; sin proteccion de manos en zona de bisagra",
  },
  {
    id: 93,
    zona: "Almacenamiento",
    criticidadRef: "MENOR",
    item: "Bandejas de contención limpias, sin pérdidas de aceite en motor del cuadro y sin accesorios apoyados sobre bandeja de Trip-Tank",
    hallazgoTipico:
      "Bandejas de contencion sucias, con perdidas de aceite del motor del cuadro; accesorios apoyados sobre bandeja de Trip-Tank",
  },
  {
    id: 94,
    zona: "Chasis",
    criticidadRef: "MENOR",
    item: "Gato de nivelación sin pérdidas de aceite; tapas laterales de bomba de ahogue con bulonería completa",
    hallazgoTipico:
      "Gato de nivelacion con perdidas de aceite; tapas laterales de bomba de ahogue con buloneria faltante",
  },
];

/**
 * Items cuyo `hallazgoTipico` fue DERIVADO de la condicion, no tomado de un informe real.
 * Reemplazar por la redaccion textual de los informes OIL DASSA / iAuditor YPF cuando se tenga.
 * El "?" de la UI los muestra aclarado, para no dar por real algo que no lo es.
 */
export const HALLAZGO_DERIVADO: ReadonlySet<number> = new Set([
  74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94,
]);

/** Items que provienen del iAuditor de YPF (el resto, de los informes OIL DASSA). */
export const ORIGEN_IAUDITOR_YPF: ReadonlySet<number> = new Set([90, 91, 92, 93, 94]);

/**
 * Orden por defecto de las zonas en los acordeones (alfabetico, como pide el requerimiento).
 * El orden de RECORRIDA fisica se configura por equipo y puede ser otro: ver ORDEN_RECORRIDA_SUGERIDO.
 */
export const ZONAS: readonly string[] = [
  "Acceso/Escaleras",
  "Acumulador hidraulico",
  "Almacenamiento",
  "BOP",
  "Bomba de ahogue/AP",
  "Chasis",
  "Documentacion",
  "Elevadores",
  "Iluminacion/Electrico",
  "Linea de vida",
  "Llave de tubing",
  "Mastil",
  "Otros",
  "Pirosalva/Anticaidas",
  "Piso de enganche",
  "Piso de trabajo",
  "Sistema operativo",
];

/**
 * Orden sugerido de recorrida fisica: de abajo hacia arriba, como se sube al equipo.
 * Es el default cuando el equipo todavia no tiene un orden propio en Configuracion.
 */
export const ORDEN_RECORRIDA_SUGERIDO: readonly string[] = [
  "Chasis",
  "Bomba de ahogue/AP",
  "Acumulador hidraulico",
  "BOP",
  "Llave de tubing",
  "Elevadores",
  "Piso de trabajo",
  "Almacenamiento",
  "Iluminacion/Electrico",
  "Otros",
  "Acceso/Escaleras",
  "Linea de vida",
  "Pirosalva/Anticaidas",
  "Piso de enganche",
  "Mastil",
  "Sistema operativo",
  "Documentacion",
];

/** Primer id disponible para items promovidos al catalogo por el usuario. */
export const ID_BASE_PERSONALIZADOS = 1000;

const DIAS_PLAZO_POR_CRITICIDAD: Record<Criticidad, number | null> = {
  CRITICA: 0, // mismo dia: no se opera hasta resolverlo
  MAYOR: 15, // vencido sin cerrar escala a CRITICA (regla YPF)
  MENOR: 30,
  GENERAL: null, // sin plazo obligatorio
};

/**
 * Plazo sugerido segun criticidad, como fecha yyyy-MM-dd. `null` para GENERAL.
 * Se arma con los componentes LOCALES, no con toISOString(): el plazo es un dia de
 * calendario argentino, y pasarlo por UTC lo corre un dia segun la zona horaria del equipo.
 */
export function plazoSugerido(criticidad: Criticidad, desde: Date = new Date()): string | null {
  const dias = DIAS_PLAZO_POR_CRITICIDAD[criticidad];
  if (dias === null) return null;
  const d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + dias);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Index por id para lookups O(1) desde la UI y el PDF. */
export const CATALOGO_POR_ID: ReadonlyMap<number, ItemCatalogo> = new Map(CATALOGO.map((it) => [it.id, it]));
