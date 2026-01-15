const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const events = await prisma.event.findMany({
        include: { markets: true },
        orderBy: { createdAt: 'desc' },
        take: 10
    });
    console.log(JSON.stringify(events, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
