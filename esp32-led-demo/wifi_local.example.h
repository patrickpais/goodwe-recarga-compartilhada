// Modelo do wifi_local.h — copie este arquivo para "wifi_local.h" (mesma
// pasta) e preencha com a rede do local da apresentação. O wifi_local.h
// real fica fora do git para a senha não vazar no repositório.
const char* STA_SSID = "NomeDaSuaRede";
const char* STA_PASS = "senha-da-rede";
// IP fixo do carregador dentro dessa rede — o app procura por ele aqui
// (ajuste os tres primeiros numeros para a faixa da sua rede; o app v2
// procura em 192.168.15.222, entao mude la tambem se mudar aqui)
IPAddress STA_IP(192, 168, 15, 222);
IPAddress STA_GW(192, 168, 15, 1);
IPAddress STA_MASK(255, 255, 255, 0);
