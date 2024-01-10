class Main {

    int placeCount;
    float wantedCount;

    public static void main(String[] args) {


        // Imagine runtime:
        // first call: wantedCount = 3.5, places 0, 1, 2, 3
        // second call: wantedCount = 7, places 4, 5, 6, 7
        // third call: wantedCount = 10.5, places 8, 9, 10
        // fourth call: wantedCount = 14, places 11, 12, 13, 14
        // fifth call: wantedCount = 17.5, places 15, 16, 17

    }



    public static void onTick() {
        wantedCount += 3.5;
        while (placeCount < wantedCount) {
            placeBlock();

        }
    }


    public static void placeBlock() {
        placeCount++;


    }


}